export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          avatar_url: string | null;
          balance: number;
          email: string | null;
          full_name_ar: string | null;
          full_name_en: string | null;
          id: string;
          is_admin: boolean;
          plan_name: string | null;
          total_spent: number;
        };
        Insert: {
          avatar_url?: string | null;
          balance?: number;
          email?: string | null;
          full_name_ar?: string | null;
          full_name_en?: string | null;
          id: string;
          is_admin?: boolean;
          plan_name?: string | null;
          total_spent?: number;
        };
        Update: {
          avatar_url?: string | null;
          balance?: number;
          email?: string | null;
          full_name_ar?: string | null;
          full_name_en?: string | null;
          id?: string;
          is_admin?: boolean;
          plan_name?: string | null;
          total_spent?: number;
        };
        Relationships: [];
      };
      media_vault: {
        Row: {
          created_at: string;
          file_name: string;
          file_size: number | null;
          file_type: string;
          file_url: string | null;
          id: string;
          notes: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          file_name: string;
          file_size?: number | null;
          file_type: string;
          file_url?: string | null;
          id?: string;
          notes?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          file_size?: number | null;
          file_type?: string;
          file_url?: string | null;
          id?: string;
          notes?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      payment_methods: {
        Row: {
          account_holder: string | null;
          id: string;
          instructions: string | null;
          is_active: boolean;
          name: string;
          provider_number: string | null;
        };
        Insert: {
          account_holder?: string | null;
          id?: string;
          instructions?: string | null;
          is_active?: boolean;
          name: string;
          provider_number?: string | null;
        };
        Update: {
          account_holder?: string | null;
          id?: string;
          instructions?: string | null;
          is_active?: boolean;
          name?: string;
          provider_number?: string | null;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          admin_notes: string | null;
          amount: number;
          credits_added: number;
          id: string;
          payment_method_id: string;
          receipt_url: string | null;
          sender_number: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          admin_notes?: string | null;
          amount: number;
          credits_added: number;
          id?: string;
          payment_method_id: string;
          receipt_url?: string | null;
          sender_number?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          admin_notes?: string | null;
          amount?: number;
          credits_added?: number;
          id?: string;
          payment_method_id?: string;
          receipt_url?: string | null;
          sender_number?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      activity_events: {
        Row: {
          actor_id: string | null;
          anonymous_session_id: string | null;
          created_at: string;
          details: Json;
          event_name: string;
          event_type: string;
          id: string;
          route: string | null;
          target: string | null;
          user_id: string;
        };
        Insert: {
          actor_id?: string | null;
          anonymous_session_id?: string | null;
          created_at?: string;
          details?: Json;
          event_name: string;
          event_type: string;
          id?: string;
          route?: string | null;
          target?: string | null;
          user_id: string;
        };
        Update: {
          actor_id?: string | null;
          anonymous_session_id?: string | null;
          created_at?: string;
          details?: Json;
          event_name?: string;
          event_type?: string;
          id?: string;
          route?: string | null;
          target?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      website_reviews: {
        Row: {
          comment: string;
          created_at: string;
          display_name: string;
          id: string;
          is_public: boolean;
          rating: number;
          user_id: string;
        };
        Insert: {
          comment: string;
          created_at?: string;
          display_name: string;
          id?: string;
          is_public?: boolean;
          rating: number;
          user_id: string;
        };
        Update: {
          comment?: string;
          created_at?: string;
          display_name?: string;
          id?: string;
          is_public?: boolean;
          rating?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      website_feedback: {
        Row: {
          category: string;
          created_at: string;
          id: string;
          message: string;
          status: string;
          user_id: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          id?: string;
          message: string;
          status?: string;
          user_id: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          id?: string;
          message?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      kling_video_requests: {
        Row: {
          created_at: string;
          id: string;
          idempotency_key: string;
          provider_task_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          idempotency_key: string;
          provider_task_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          idempotency_key?: string;
          provider_task_id?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      approve_transaction: {
        Args: { _approve: boolean; _transaction_id: string };
        Returns: undefined;
      };
      consume_credit: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      consume_credits: {
        Args: { _amount: number };
        Returns: number;
      };
      ensure_customer_profile: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      claim_auth_device: {
        Args: { p_device_hash: string };
        Returns: boolean;
      };
      log_ui_event: {
        Args: {
          _anonymous_session_id?: string | null;
          _details?: Json;
          _event_name: string;
          _route: string | null;
          _target: string | null;
        };
        Returns: undefined;
      };
      is_app_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      get_kling_video_quota: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      reserve_kling_video_request: {
        Args: { _idempotency_key: string };
        Returns: Json;
      };
      attach_kling_video_task: {
        Args: { _provider_task_id: string; _request_id: string };
        Returns: undefined;
      };
      get_kling_video_task: {
        Args: { _request_id: string };
        Returns: string;
      };
      website_review_summary: {
        Args: Record<PropertyKey, never>;
        Returns: {
          average_rating: number;
          review_count: number;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Insert: infer I }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Update: infer U }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
