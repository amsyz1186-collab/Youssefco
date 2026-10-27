export function formatRpcError(
  error: { code: string; message: string },
  functionName: string,
  migrationName: string,
): string {
  if (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find (the )?function/i.test(error.message)
  ) {
    return `دالة Supabase ${functionName} غير متوفرة أو لم يُحدّث مخططها. طبّق ${migrationName} في Supabase SQL Editor ثم أعد المحاولة.`;
  }
  return error.message;
}
