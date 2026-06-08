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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bakeoff_truth: {
        Row: {
          card_id: string
          card_name: string | null
          card_number: string | null
          card_set: string | null
          card_year: string | null
          created_at: string
          created_by: string | null
          notes: string | null
          rarity: string | null
          updated_at: string
          variant: string | null
        }
        Insert: {
          card_id: string
          card_name?: string | null
          card_number?: string | null
          card_set?: string | null
          card_year?: string | null
          created_at?: string
          created_by?: string | null
          notes?: string | null
          rarity?: string | null
          updated_at?: string
          variant?: string | null
        }
        Update: {
          card_id?: string
          card_name?: string | null
          card_number?: string | null
          card_set?: string | null
          card_year?: string | null
          created_at?: string
          created_by?: string | null
          notes?: string | null
          rarity?: string | null
          updated_at?: string
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bakeoff_truth_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: true
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_templates: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["campaign_channel"]
          created_at: string
          created_by: string | null
          id: string
          name: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body: string
          channel?: Database["public"]["Enums"]["campaign_channel"]
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["campaign_channel"]
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      card_folders: {
        Row: {
          card_id: string
          created_at: string
          folder_id: string
          id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          folder_id: string
          id?: string
        }
        Update: {
          card_id?: string
          created_at?: string
          folder_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_folders_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_folders_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          ai_analysis: Json | null
          analysis_completed_at: string | null
          analysis_error: string | null
          analysis_started_at: string | null
          analysis_status: string
          authentiseal_serial: string | null
          card_name: string | null
          card_set: string | null
          card_year: string | null
          category: string | null
          condition_grade: string | null
          created_at: string
          ebay_recent_sales: Json | null
          edition: string | null
          estimated_value_high: number | null
          estimated_value_low: number | null
          id: string
          image_url: string
          is_listed: boolean
          is_public: boolean
          last_scanned_at: string | null
          notes: string | null
          psa_population_data: Json | null
          rarity: string | null
          special_features: string[] | null
          tcgplayer_price: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_analysis?: Json | null
          analysis_completed_at?: string | null
          analysis_error?: string | null
          analysis_started_at?: string | null
          analysis_status?: string
          authentiseal_serial?: string | null
          card_name?: string | null
          card_set?: string | null
          card_year?: string | null
          category?: string | null
          condition_grade?: string | null
          created_at?: string
          ebay_recent_sales?: Json | null
          edition?: string | null
          estimated_value_high?: number | null
          estimated_value_low?: number | null
          id?: string
          image_url: string
          is_listed?: boolean
          is_public?: boolean
          last_scanned_at?: string | null
          notes?: string | null
          psa_population_data?: Json | null
          rarity?: string | null
          special_features?: string[] | null
          tcgplayer_price?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_analysis?: Json | null
          analysis_completed_at?: string | null
          analysis_error?: string | null
          analysis_started_at?: string | null
          analysis_status?: string
          authentiseal_serial?: string | null
          card_name?: string | null
          card_set?: string | null
          card_year?: string | null
          category?: string | null
          condition_grade?: string | null
          created_at?: string
          ebay_recent_sales?: Json | null
          edition?: string | null
          estimated_value_high?: number | null
          estimated_value_low?: number | null
          id?: string
          image_url?: string
          is_listed?: boolean
          is_public?: boolean
          last_scanned_at?: string | null
          notes?: string | null
          psa_population_data?: Json | null
          rarity?: string | null
          special_features?: string[] | null
          tcgplayer_price?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      demo_scan_rate_limit: {
        Row: {
          ip_hash: string
          scan_count: number
          window_start: string
        }
        Insert: {
          ip_hash: string
          scan_count?: number
          window_start?: string
        }
        Update: {
          ip_hash?: string
          scan_count?: number
          window_start?: string
        }
        Relationships: []
      }
      drip_campaign_queue: {
        Row: {
          body: string
          created_at: string
          id: string
          lead_id: string
          scheduled_for: string
          sent: boolean
          sent_at: string | null
          step: number
          subject: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          lead_id: string
          scheduled_for: string
          sent?: boolean
          sent_at?: string | null
          step: number
          subject: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          lead_id?: string
          scheduled_for?: string
          sent?: boolean
          sent_at?: string | null
          step?: number
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "drip_campaign_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      folders: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ip_rate_limits: {
        Row: {
          bucket_key: string
          ip_hash: string
          request_count: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          ip_hash: string
          request_count?: number
          window_start?: string
        }
        Update: {
          bucket_key?: string
          ip_hash?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      lead_activities: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          metadata: Json | null
          type: Database["public"]["Enums"]["activity_type"]
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          metadata?: Json | null
          type: Database["public"]["Enums"]["activity_type"]
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          type?: Database["public"]["Enums"]["activity_type"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          company: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          partner_code: string | null
          phone: string | null
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          partner_code?: string | null
          phone?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          partner_code?: string | null
          phone?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: []
      }
      marketplace_listings: {
        Row: {
          card_id: string
          chain: Database["public"]["Enums"]["blockchain_network"]
          contract_listing_id: string | null
          created_at: string
          description: string | null
          id: string
          payment_token: Database["public"]["Enums"]["payment_token"]
          price: number
          seller_id: string
          seller_wallet: string
          status: Database["public"]["Enums"]["listing_status"]
          updated_at: string
        }
        Insert: {
          card_id: string
          chain: Database["public"]["Enums"]["blockchain_network"]
          contract_listing_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          payment_token: Database["public"]["Enums"]["payment_token"]
          price: number
          seller_id: string
          seller_wallet: string
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
        }
        Update: {
          card_id?: string
          chain?: Database["public"]["Enums"]["blockchain_network"]
          contract_listing_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          payment_token?: Database["public"]["Enums"]["payment_token"]
          price?: number
          seller_id?: string
          seller_wallet?: string
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
        }
        Relationships: []
      }
      marketplace_orders: {
        Row: {
          amount: number
          auto_release_at: string | null
          buyer_id: string
          buyer_wallet: string
          chain: Database["public"]["Enums"]["blockchain_network"]
          created_at: string
          delivery_confirmed_at: string | null
          escrow_address: string | null
          escrow_tx_hash: string | null
          id: string
          listing_id: string
          payment_token: Database["public"]["Enums"]["payment_token"]
          release_tx_hash: string | null
          seller_id: string
          seller_wallet: string
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          auto_release_at?: string | null
          buyer_id: string
          buyer_wallet: string
          chain: Database["public"]["Enums"]["blockchain_network"]
          created_at?: string
          delivery_confirmed_at?: string | null
          escrow_address?: string | null
          escrow_tx_hash?: string | null
          id?: string
          listing_id: string
          payment_token: Database["public"]["Enums"]["payment_token"]
          release_tx_hash?: string | null
          seller_id: string
          seller_wallet: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          auto_release_at?: string | null
          buyer_id?: string
          buyer_wallet?: string
          chain?: Database["public"]["Enums"]["blockchain_network"]
          created_at?: string
          delivery_confirmed_at?: string | null
          escrow_address?: string | null
          escrow_tx_hash?: string | null
          id?: string
          listing_id?: string
          payment_token?: Database["public"]["Enums"]["payment_token"]
          release_tx_hash?: string | null
          seller_id?: string
          seller_wallet?: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      nft_certificates: {
        Row: {
          authentiseal_serial: string | null
          card_id: string
          chain: Database["public"]["Enums"]["blockchain_network"]
          contract_address: string
          id: string
          metadata_uri: string | null
          mint_tx_hash: string
          minted_at: string
          order_id: string
          owner_wallet: string
          token_id: string
        }
        Insert: {
          authentiseal_serial?: string | null
          card_id: string
          chain: Database["public"]["Enums"]["blockchain_network"]
          contract_address: string
          id?: string
          metadata_uri?: string | null
          mint_tx_hash: string
          minted_at?: string
          order_id: string
          owner_wallet: string
          token_id: string
        }
        Update: {
          authentiseal_serial?: string | null
          card_id?: string
          chain?: Database["public"]["Enums"]["blockchain_network"]
          contract_address?: string
          id?: string
          metadata_uri?: string | null
          mint_tx_hash?: string
          minted_at?: string
          order_id?: string
          owner_wallet?: string
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nft_certificates_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_shipments: {
        Row: {
          carrier: string
          created_at: string
          delivered_at: string | null
          id: string
          order_id: string
          ship_address_encrypted: string | null
          shipped_at: string | null
          tracking_number: string
          tracking_payload: Json | null
          tracking_status: string | null
          updated_at: string
        }
        Insert: {
          carrier: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          order_id: string
          ship_address_encrypted?: string | null
          shipped_at?: string | null
          tracking_number: string
          tracking_payload?: Json | null
          tracking_status?: string | null
          updated_at?: string
        }
        Update: {
          carrier?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          order_id?: string
          ship_address_encrypted?: string | null
          shipped_at?: string | null
          tracking_number?: string
          tracking_payload?: Json | null
          tracking_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          sent_count: number
          status: Database["public"]["Enums"]["campaign_status"]
          target_filter: Json | null
          template_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          sent_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          target_filter?: Json | null
          template_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          sent_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          target_filter?: Json | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "campaign_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      pack_rips: {
        Row: {
          best_pull_name: string | null
          best_pull_value: number | null
          created_at: string
          id: string
          pulls: Json
          retail_cost: number | null
          set_name: string
          share_token: string
          total_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          best_pull_name?: string | null
          best_pull_value?: number | null
          created_at?: string
          id?: string
          pulls?: Json
          retail_cost?: number | null
          set_name: string
          share_token?: string
          total_value?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          best_pull_name?: string | null
          best_pull_value?: number | null
          created_at?: string
          id?: string
          pulls?: Json
          retail_cost?: number | null
          set_name?: string
          share_token?: string
          total_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      price_history: {
        Row: {
          card_id: string
          high_price: number | null
          id: string
          low_price: number | null
          median_price: number | null
          price_count: number | null
          raw_prices: Json | null
          recorded_at: string
          source: string
          user_id: string
        }
        Insert: {
          card_id: string
          high_price?: number | null
          id?: string
          low_price?: number | null
          median_price?: number | null
          price_count?: number | null
          raw_prices?: Json | null
          recorded_at?: string
          source: string
          user_id: string
        }
        Update: {
          card_id?: string
          high_price?: number | null
          id?: string
          low_price?: number | null
          median_price?: number | null
          price_count?: number | null
          raw_prices?: Json | null
          recorded_at?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_history_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          public_collection_enabled: boolean
          public_collection_slug: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          public_collection_enabled?: boolean
          public_collection_slug?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          public_collection_enabled?: boolean
          public_collection_slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          credited: boolean
          id: string
          referral_code: string
          referred_id: string
          referrer_id: string
        }
        Insert: {
          created_at?: string
          credited?: boolean
          id?: string
          referral_code: string
          referred_id: string
          referrer_id: string
        }
        Update: {
          created_at?: string
          credited?: boolean
          id?: string
          referral_code?: string
          referred_id?: string
          referrer_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          created_at: string
          credits: number
          id: string
          plan: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits?: number
          id?: string
          plan?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          plan?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          address: string
          chain: Database["public"]["Enums"]["blockchain_network"]
          created_at: string
          id: string
          is_primary: boolean
          user_id: string
        }
        Insert: {
          address: string
          chain: Database["public"]["Enums"]["blockchain_network"]
          created_at?: string
          id?: string
          is_primary?: boolean
          user_id: string
        }
        Update: {
          address?: string
          chain?: Database["public"]["Enums"]["blockchain_network"]
          created_at?: string
          id?: string
          is_primary?: boolean
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_profiles: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          id: string | null
          public_collection_enabled: boolean | null
          public_collection_slug: string | null
        }
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string | null
          public_collection_enabled?: boolean | null
          public_collection_slug?: string | null
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string | null
          public_collection_enabled?: boolean | null
          public_collection_slug?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      consume_demo_scan: {
        Args: { _ip_hash: string; _max_per_day?: number }
        Returns: {
          allowed: boolean
          remaining: number
        }[]
      }
      consume_ip_rate_limit: {
        Args: {
          _bucket_key: string
          _ip_hash: string
          _max_requests: number
          _window_seconds: number
        }
        Returns: {
          allowed: boolean
          remaining: number
        }[]
      }
      deduct_credit: { Args: { _user_id: string }; Returns: number }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      activity_type:
        | "email_sent"
        | "sms_sent"
        | "status_change"
        | "note"
        | "call"
      blockchain_network: "ethereum" | "solana"
      campaign_channel: "email" | "sms"
      campaign_status: "draft" | "sending" | "sent"
      lead_source: "form" | "manual" | "csv" | "lead_magnet"
      lead_status: "new" | "contacted" | "interested" | "converted" | "lost"
      listing_status: "active" | "pending" | "sold" | "cancelled"
      order_status:
        | "escrowed"
        | "shipped"
        | "delivered"
        | "released"
        | "refunded"
        | "disputed"
      payment_token: "USDC" | "USDT"
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
      activity_type: [
        "email_sent",
        "sms_sent",
        "status_change",
        "note",
        "call",
      ],
      blockchain_network: ["ethereum", "solana"],
      campaign_channel: ["email", "sms"],
      campaign_status: ["draft", "sending", "sent"],
      lead_source: ["form", "manual", "csv", "lead_magnet"],
      lead_status: ["new", "contacted", "interested", "converted", "lost"],
      listing_status: ["active", "pending", "sold", "cancelled"],
      order_status: [
        "escrowed",
        "shipped",
        "delivered",
        "released",
        "refunded",
        "disputed",
      ],
      payment_token: ["USDC", "USDT"],
    },
  },
} as const
