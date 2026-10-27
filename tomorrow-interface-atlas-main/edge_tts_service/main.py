import hmac
import logging
import os
from typing import Annotated

import edge_tts
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

app = FastAPI(docs_url=None, redoc_url=None)
logger = logging.getLogger(__name__)

VOICES = {
    "Arabic": {
        "egyptian": "ar-EG-SalmaNeural",
        "msa": "ar-SA-ZariyahNeural",
        "levantine": "ar-LB-LaylaNeural",
        "gulf": "ar-AE-FatimaNeural",
        "iraqi": "ar-IQ-RanaNeural",
        "maghrebi": "ar-MA-MounaNeural",
        "sudanese": "ar-SD-SafaaNeural",
        "yemeni": "ar-YE-MaryamNeural",
    },
    "English": {
        "us": "en-US-AvaNeural",
        "uk": "en-GB-SoniaNeural",
        "australian": "en-AU-NatashaNeural",
        "indian": "en-IN-NeerjaNeural",
    },
    "Spanish": {
        "spain": "es-ES-ElviraNeural",
        "mexican": "es-MX-DaliaNeural",
        "latin_american": "es-CO-SalomeNeural",
    },
    "French": {"france": "fr-FR-DeniseNeural", "canadian": "fr-CA-SylvieNeural"},
    "German": {"standard": "de-DE-KatjaNeural", "austrian": "de-AT-IngridNeural"},
    "Italian": {"standard": "it-IT-ElsaNeural"},
    "Portuguese": {"brazilian": "pt-BR-FranciscaNeural", "european": "pt-PT-RaquelNeural"},
    "Turkish": {"standard": "tr-TR-EmelNeural"},
    "Russian": {"standard": "ru-RU-SvetlanaNeural"},
    "Chinese": {"mandarin": "zh-CN-XiaoxiaoNeural", "cantonese": "zh-HK-HiuGaaiNeural"},
    "Japanese": {"standard": "ja-JP-NanamiNeural"},
    "Korean": {"standard": "ko-KR-SunHiNeural"},
    "Hindi": {"standard": "hi-IN-SwaraNeural"},
    "Urdu": {"standard": "ur-PK-UzmaNeural"},
    "Persian": {"standard": "fa-IR-DilaraNeural"},
    "Indonesian": {"standard": "id-ID-GadisNeural"},
    "Malay": {"standard": "ms-MY-YasminNeural"},
    "Swahili": {"standard": "sw-KE-ZuriNeural"},
    "Dutch": {"standard": "nl-NL-ColetteNeural"},
    "Swedish": {"standard": "sv-SE-SofieNeural"},
    "Polish": {"standard": "pl-PL-ZofiaNeural"},
    "Greek": {"standard": "el-GR-AthinaNeural"},
    "Hebrew": {"standard": "he-IL-HilaNeural"},
    "Thai": {"standard": "th-TH-PremwadeeNeural"},
    "Vietnamese": {"standard": "vi-VN-HoaiMyNeural"},
}

TONE_RATES = {
    "warm": "+0%",
    "energetic": "+8%",
    "dramatic": "-5%",
    "calm": "-8%",
    "persuasive": "+3%",
}


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    language: str
    dialect: str
    tone: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/v1/speech")
async def create_speech(
    payload: SpeechRequest,
    authorization: Annotated[str | None, Header()] = None,
):
    token = os.environ.get("EDGE_TTS_SERVICE_TOKEN", "")
    if not token or not hmac.compare_digest(authorization or "", f"Bearer {token}"):
        raise HTTPException(status_code=401, detail="Unauthorized")

    language_voices = VOICES.get(payload.language)
    if not language_voices:
        raise HTTPException(status_code=400, detail="Unsupported language")
    voice = language_voices.get(payload.dialect) or language_voices.get("standard")
    if not voice:
        voice = next(iter(language_voices.values()))
    if payload.tone not in TONE_RATES:
        raise HTTPException(status_code=400, detail="Unsupported voice tone")

    try:
        audio = bytearray()
        communicate = edge_tts.Communicate(
            payload.text,
            voice,
            rate=TONE_RATES[payload.tone],
        )
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.extend(chunk["data"])
                if len(audio) > 10 * 1024 * 1024:
                    raise HTTPException(status_code=413, detail="Audio output is too large")
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Edge TTS speech generation failed")
        raise HTTPException(status_code=502, detail="Speech generation failed") from error

    if not audio:
        raise HTTPException(status_code=502, detail="Speech provider returned no audio")
    return Response(bytes(audio), media_type="audio/mpeg")
