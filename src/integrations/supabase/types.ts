export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agent_settings: {
        Row: {
          agent_name: string
          company_name: string
          crm_provider: string
          handover_keywords: string[]
          instructions: string
          is_live: boolean
          owner_id: string
          require_verification: boolean
          tone: string
          updated_at: string
        }
        Insert: {
          agent_name?: string
          company_name?: string
          crm_provider?: string
          handover_keywords?: string[]
          instructions?: string
          is_live?: boolean
          owner_id?: string
          require_verification?: boolean
          tone?: string
          updated_at?: string
        }
        Update: {
          agent_name?: string
          company_name?: string
          crm_provider?: string
          handover_keywords?: string[]
          instructions?: string
          is_live?: boolean
          owner_id?: string
          require_verification?: boolean
          tone?: string
          updated_at?: string
        }
        Relationships: []
      }
      channel_connections: {
        Row: {
          account_name: string | null
          channel: Database["public"]["Enums"]["channel_type"]
          owner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          channel: Database["public"]["Enums"]["channel_type"]
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          channel?: Database["public"]["Enums"]["channel_type"]
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          channel: Database["public"]["Enums"]["channel_type"]
          contact_handle: string | null
          contact_name: string
          created_at: string
          customer_id: string | null
          handover_reason: string | null
          id: string
          last_message_at: string
          last_message_preview: string | null
          mode: Database["public"]["Enums"]["conversation_mode"]
          owner_id: string
          status: Database["public"]["Enums"]["conversation_status"]
          unread_count: number
        }
        Insert: {
          channel: Database["public"]["Enums"]["channel_type"]
          contact_handle?: string | null
          contact_name: string
          created_at?: string
          customer_id?: string | null
          handover_reason?: string | null
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          mode?: Database["public"]["Enums"]["conversation_mode"]
          owner_id?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
        }
        Update: {
          channel?: Database["public"]["Enums"]["channel_type"]
          contact_handle?: string | null
          contact_name?: string
          created_at?: string
          customer_id?: string | null
          handover_reason?: string | null
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          mode?: Database["public"]["Enums"]["conversation_mode"]
          owner_id?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "crm_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_customers: {
        Row: {
          city: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          instagram_handle: string | null
          notes: string | null
          owner_id: string
          phone: string | null
          segment: string
          telegram_username: string | null
          whatsapp_phone: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          instagram_handle?: string | null
          notes?: string | null
          owner_id?: string
          phone?: string | null
          segment?: string
          telegram_username?: string | null
          whatsapp_phone?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          instagram_handle?: string | null
          notes?: string | null
          owner_id?: string
          phone?: string | null
          segment?: string
          telegram_username?: string | null
          whatsapp_phone?: string | null
        }
        Relationships: []
      }
      crm_orders: {
        Row: {
          created_at: string
          currency: string
          customer_id: string
          delivery_address: string | null
          expected_delivery: string | null
          id: string
          items: string
          order_number: string
          owner_id: string
          status: string
          total: number
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_id: string
          delivery_address?: string | null
          expected_delivery?: string | null
          id?: string
          items?: string
          order_number: string
          owner_id?: string
          status?: string
          total?: number
        }
        Update: {
          created_at?: string
          currency?: string
          customer_id?: string
          delivery_address?: string | null
          expected_delivery?: string | null
          id?: string
          items?: string
          order_number?: string
          owner_id?: string
          status?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "crm_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_articles: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          id?: string
          owner_id?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_voice: boolean
          owner_id: string
          response_ms: number | null
          role: Database["public"]["Enums"]["message_role"]
          sources: Json
          voice_meta: Json | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_voice?: boolean
          owner_id?: string
          response_ms?: number | null
          role: Database["public"]["Enums"]["message_role"]
          sources?: Json
          voice_meta?: Json | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_voice?: boolean
          owner_id?: string
          response_ms?: number | null
          role?: Database["public"]["Enums"]["message_role"]
          sources?: Json
          voice_meta?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      seed_demo_workspace: { Args: { _owner: string }; Returns: undefined }
    }
    Enums: {
      channel_type: "telegram" | "instagram" | "whatsapp"
      conversation_mode: "ai" | "human"
      conversation_status: "open" | "pending" | "resolved"
      message_role: "customer" | "ai" | "operator" | "system"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      channel_type: ["telegram", "instagram", "whatsapp"],
      conversation_mode: ["ai", "human"],
      conversation_status: ["open", "pending", "resolved"],
      message_role: ["customer", "ai", "operator", "system"],
    },
  },
} as const
