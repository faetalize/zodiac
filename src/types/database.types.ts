/**
 * ⚠️  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY ⚠️
 * 
 * This file is generated from the Supabase schema.
 * Run `npm run sync-db-types` to regenerate (maintainer only).
 * 
 * Contributors: Treat this as READ-ONLY.
 * If you need schema changes, open an issue describing the required modifications.
 * 
 * Generated: 2026-03-09
 */

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
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      admin_comment_deletions: {
        Row: {
          admin_id: string
          author_id: string
          author_username: string
          comment_content: string
          deleted_at: string
          id: string
          persona_id: string
          persona_name: string
        }
        Insert: {
          admin_id: string
          author_id: string
          author_username: string
          comment_content: string
          deleted_at?: string
          id?: string
          persona_id: string
          persona_name: string
        }
        Update: {
          admin_id?: string
          author_id?: string
          author_username?: string
          comment_content?: string
          deleted_at?: string
          id?: string
          persona_id?: string
          persona_name?: string
        }
        Relationships: []
      }
      admin_persona_deletions: {
        Row: {
          admin_id: string
          creator_id: string
          creator_username: string
          deleted_at: string
          id: string
          persona_name: string
        }
        Insert: {
          admin_id: string
          creator_id: string
          creator_username: string
          deleted_at?: string
          id?: string
          persona_name: string
        }
        Update: {
          admin_id?: string
          creator_id?: string
          creator_username?: string
          deleted_at?: string
          id?: string
          persona_name?: string
        }
        Relationships: []
      }
      admin_spotlight_modifications: {
        Row: {
          action: Database["public"]["Enums"]["spotlight_action"]
          admin_id: string
          id: string
          modified_at: string
          new_order: number | null
          old_order: number | null
          persona_id: string
          persona_name: string
        }
        Insert: {
          action: Database["public"]["Enums"]["spotlight_action"]
          admin_id: string
          id?: string
          modified_at?: string
          new_order?: number | null
          old_order?: number | null
          persona_id: string
          persona_name: string
        }
        Update: {
          action?: Database["public"]["Enums"]["spotlight_action"]
          admin_id?: string
          id?: string
          modified_at?: string
          new_order?: number | null
          old_order?: number | null
          persona_id?: string
          persona_name?: string
        }
        Relationships: []
      }
      admin_user_bans: {
        Row: {
          admin_id: string
          banned_at: string
          id: string
          target_user_id: string
          target_username: string
        }
        Insert: {
          admin_id: string
          banned_at?: string
          id?: string
          target_user_id: string
          target_username: string
        }
        Update: {
          admin_id?: string
          banned_at?: string
          id?: string
          target_user_id?: string
          target_username?: string
        }
        Relationships: []
      }
      deleted_comments: {
        Row: {
          comment_content: string
          comment_id: string
          deleted_at: string | null
          deleted_by: string
          id: string
          persona_id: string
          persona_name: string
        }
        Insert: {
          comment_content: string
          comment_id: string
          deleted_at?: string | null
          deleted_by: string
          id?: string
          persona_id: string
          persona_name: string
        }
        Update: {
          comment_content?: string
          comment_id?: string
          deleted_at?: string | null
          deleted_by?: string
          id?: string
          persona_id?: string
          persona_name?: string
        }
        Relationships: []
      }
      deleted_personas: {
        Row: {
          deleted_at: string | null
          deleted_by: string
          id: string
          persona_description: string | null
          persona_id: string
          persona_name: string
        }
        Insert: {
          deleted_at?: string | null
          deleted_by: string
          id?: string
          persona_description?: string | null
          persona_id: string
          persona_name: string
        }
        Update: {
          deleted_at?: string | null
          deleted_by?: string
          id?: string
          persona_description?: string | null
          persona_id?: string
          persona_name?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      image_generations: {
        Row: {
          created_at: string
          id: number
          remaining_image_generations: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          remaining_image_generations?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          remaining_image_generations?: number
          user_id?: string
        }
        Relationships: []
      }
      persona_comment_upvotes: {
        Row: {
          comment_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_comment_upvotes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "persona_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_comment_upvotes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "persona_marketplace"
            referencedColumns: ["featured_comment_id"]
          },
          {
            foreignKeyName: "persona_comment_upvotes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "spotlight_marketplace"
            referencedColumns: ["featured_comment_id"]
          },
        ]
      }
      persona_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          persona_id: string
          updated_at: string
          upvotes: number
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          persona_id: string
          updated_at?: string
          upvotes?: number
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          persona_id?: string
          updated_at?: string
          upvotes?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_comments_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "persona_marketplace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_comments_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_comments_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "spotlight_marketplace"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_downloads: {
        Row: {
          downloaded_at: string
          id: string
          persona_id: string
          user_id: string
        }
        Insert: {
          downloaded_at?: string
          id?: string
          persona_id?: string
          user_id?: string
        }
        Update: {
          downloaded_at?: string
          id?: string
          persona_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_downloads_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "persona_marketplace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_downloads_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_downloads_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "spotlight_marketplace"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_ratings: {
        Row: {
          created_at: string
          id: string
          persona_id: string
          rating: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          persona_id: string
          rating: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          persona_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_ratings_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "persona_marketplace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_ratings_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_ratings_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "spotlight_marketplace"
            referencedColumns: ["id"]
          },
        ]
      }
      personas: {
        Row: {
          aggressiveness: number
          category: Database["public"]["Enums"]["persona_category"]
          created_at: string
          creator_id: string
          description: string
          id: string
          image_url: string | null
          independence: number
          internet_enabled: boolean
          last_updated: string
          name: string
          nsfw: boolean
          prompt: string
          roleplay_enabled: boolean
          sensuality: number
          tags: string[]
          tone_examples: string[] | null
          version: number
        }
        Insert: {
          aggressiveness?: number
          category?: Database["public"]["Enums"]["persona_category"]
          created_at?: string
          creator_id: string
          description?: string
          id?: string
          image_url?: string | null
          independence?: number
          internet_enabled?: boolean
          last_updated?: string
          name?: string
          nsfw?: boolean
          prompt?: string
          roleplay_enabled?: boolean
          sensuality?: number
          tags?: string[]
          tone_examples?: string[] | null
          version?: number
        }
        Update: {
          aggressiveness?: number
          category?: Database["public"]["Enums"]["persona_category"]
          created_at?: string
          creator_id?: string
          description?: string
          id?: string
          image_url?: string | null
          independence?: number
          internet_enabled?: boolean
          last_updated?: string
          name?: string
          nsfw?: boolean
          prompt?: string
          roleplay_enabled?: boolean
          sensuality?: number
          tags?: string[]
          tone_examples?: string[] | null
          version?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar: string | null
          created_at: string
          id: number
          preferredName: string | null
          role: Database["public"]["Enums"]["user_role"]
          systemPromptAddition: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          avatar?: string | null
          created_at?: string
          id?: number
          preferredName?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          systemPromptAddition?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          avatar?: string | null
          created_at?: string
          id?: number
          preferredName?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          systemPromptAddition?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      spotlight_personas: {
        Row: {
          added_by: string
          created_at: string
          display_order: number
          id: string
          persona_id: string
        }
        Insert: {
          added_by: string
          created_at?: string
          display_order?: number
          id?: string
          persona_id: string
        }
        Update: {
          added_by?: string
          created_at?: string
          display_order?: number
          id?: string
          persona_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spotlight_personas_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: true
            referencedRelation: "persona_marketplace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spotlight_personas_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: true
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spotlight_personas_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: true
            referencedRelation: "spotlight_marketplace"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string
          current_period_end: string | null
          price_id: Database["public"]["Enums"]["subscription_tier"] | null
          remaining_image_generations: number
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          price_id?: Database["public"]["Enums"]["subscription_tier"] | null
          remaining_image_generations?: number
          status: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          price_id?: Database["public"]["Enums"]["subscription_tier"] | null
          remaining_image_generations?: number
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_sync_preferences: {
        Row: {
          created_at: string
          encryption_salt: string | null
          key_verification: string | null
          key_verification_iv: string | null
          sync_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encryption_salt?: string | null
          key_verification?: string | null
          key_verification_iv?: string | null
          sync_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encryption_salt?: string | null
          key_verification?: string | null
          key_verification_iv?: string | null
          sync_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_sync_quotas: {
        Row: {
          created_at: string
          storage_quota_bytes: number
          storage_used_bytes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          storage_quota_bytes?: number
          storage_used_bytes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          storage_quota_bytes?: number
          storage_used_bytes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_synced_chats: {
        Row: {
          created_at: string
          deleted: boolean
          encrypted_data: string
          id: string
          iv: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted?: boolean
          encrypted_data: string
          id: string
          iv: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted?: boolean
          encrypted_data?: string
          id?: string
          iv?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_synced_messages: {
        Row: {
          chat_id: string
          created_at: string
          deleted: boolean
          encrypted_data: string
          iv: string
          message_index: number
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          deleted?: boolean
          encrypted_data: string
          iv: string
          message_index: number
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          deleted?: boolean
          encrypted_data?: string
          iv?: string
          message_index?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_synced_messages_chat_fkey"
            columns: ["user_id", "chat_id"]
            isOneToOne: false
            referencedRelation: "user_synced_chats"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      user_synced_personas: {
        Row: {
          created_at: string
          deleted: boolean
          encrypted_data: string
          id: string
          iv: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted?: boolean
          encrypted_data: string
          id: string
          iv: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted?: boolean
          encrypted_data?: string
          id?: string
          iv?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_synced_settings: {
        Row: {
          created_at: string
          encrypted_data: string
          iv: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_data: string
          iv: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_data?: string
          iv?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      persona_marketplace: {
        Row: {
          aggressiveness: number | null
          category: Database["public"]["Enums"]["persona_category"] | null
          comment_count: number | null
          created_at: string | null
          creator_id: string | null
          creator_name: string | null
          description: string | null
          download_count: number | null
          featured_comment_author: string | null
          featured_comment_id: string | null
          featured_comment_text: string | null
          featured_comment_upvotes: number | null
          id: string | null
          image_url: string | null
          independence: number | null
          internet_enabled: boolean | null
          last_updated: string | null
          name: string | null
          nsfw: boolean | null
          prompt: string | null
          rating: number | null
          roleplay_enabled: boolean | null
          sensuality: number | null
          tags: string[] | null
          tone_examples: string[] | null
          version: number | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          avatar: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          avatar?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          avatar?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      spotlight_marketplace: {
        Row: {
          aggressiveness: number | null
          category: Database["public"]["Enums"]["persona_category"] | null
          comment_count: number | null
          created_at: string | null
          creator_id: string | null
          creator_name: string | null
          description: string | null
          display_order: number | null
          download_count: number | null
          featured_comment_author: string | null
          featured_comment_id: string | null
          featured_comment_text: string | null
          featured_comment_upvotes: number | null
          id: string | null
          image_url: string | null
          independence: number | null
          internet_enabled: boolean | null
          last_updated: string | null
          name: string | null
          nsfw: boolean | null
          prompt: string | null
          rating: number | null
          roleplay_enabled: boolean | null
          sensuality: number | null
          spotlight_added_at: string | null
          tags: string[] | null
          tone_examples: string[] | null
          version: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_read_cloud_sync: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      can_use_cloud_sync: { Args: { target_user_id: string }; Returns: boolean }
      check_array_items_length: {
        Args: { arr: string[]; max_len: number }
        Returns: boolean
      }
      cleanup_sync_tombstones: { Args: never; Returns: undefined }
      get_popular_tags: {
        Args: { tag_limit?: number }
        Returns: {
          tag: string
          total_downloads: number
        }[]
      }
      migrate_to_image_generations: { Args: never; Returns: undefined }
      purge_expired_synced_data: { Args: never; Returns: undefined }
      recalculate_user_storage: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      set_session_user: { Args: { user_id_value: string }; Returns: undefined }
      set_user_storage_quota: {
        Args: { new_quota_bytes: number; target_user_id: string }
        Returns: undefined
      }
      wipe_my_synced_data: { Args: never; Returns: undefined }
    }
    Enums: {
      persona_category: "character" | "assistant"
      spotlight_action: "add" | "remove" | "move"
      subscription_tier:
        | "price_1S0hdiGiJrKwXclRByeNLSPu"
        | "price_1S0heGGiJrKwXclR69Ku7XEc"
        | "price_1SDdbKGiJrKwXclR7hn7fF4s"
        | "price_1SDeIFGiJrKwXclRCNThnoXH"
        | "price_1SDf2NGiJrKwXclRwDs7XOd0"
        | "price_1SDf2rGiJrKwXclReGeg8fQo"
        | "price_1SOU2lKcI9PDo3JBhsT8URS9"
        | "price_1SOU3qKcI9PDo3JBk4rKTDaC"
        | "price_1T9CqjKcI9PDo3JBP6613Pzh"
        | "price_1T9CqqKcI9PDo3JBBGC59S8O"
        | "price_1T9CqqKcI9PDo3JB7LXgL5MV"
        | "price_1T9DCYKcI9PDo3JBsFc4nlZa"
        | "price_1T9CqkKcI9PDo3JBEqHYJU68"
      user_role: "user" | "admin"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      persona_category: ["character", "assistant"],
      spotlight_action: ["add", "remove", "move"],
      subscription_tier: [
        "price_1S0hdiGiJrKwXclRByeNLSPu",
        "price_1S0heGGiJrKwXclR69Ku7XEc",
        "price_1SDdbKGiJrKwXclR7hn7fF4s",
        "price_1SDeIFGiJrKwXclRCNThnoXH",
        "price_1SDf2NGiJrKwXclRwDs7XOd0",
        "price_1SDf2rGiJrKwXclReGeg8fQo",
        "price_1SOU2lKcI9PDo3JBhsT8URS9",
        "price_1SOU3qKcI9PDo3JBk4rKTDaC",
        "price_1T9CqjKcI9PDo3JBP6613Pzh",
        "price_1T9CqqKcI9PDo3JBBGC59S8O",
        "price_1T9CqqKcI9PDo3JB7LXgL5MV",
        "price_1T9DCYKcI9PDo3JBsFc4nlZa",
        "price_1T9CqkKcI9PDo3JBEqHYJU68",
      ],
      user_role: ["user", "admin"],
    },
  },
} as const
