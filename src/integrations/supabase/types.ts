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
      agendamento_status_log: {
        Row: {
          agendamento_id: string
          created_at: string
          criado_por: string | null
          id: string
          mensagem: string | null
          status: string
        }
        Insert: {
          agendamento_id: string
          created_at?: string
          criado_por?: string | null
          id?: string
          mensagem?: string | null
          status: string
        }
        Update: {
          agendamento_id?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          mensagem?: string | null
          status?: string
        }
        Relationships: []
      }
      agendamentos: {
        Row: {
          arquivado: boolean
          barbeiro_id: string | null
          barbeiro_nome: string | null
          cliente_id: string | null
          cliente_nome: string
          cliente_sobrenome: string
          cliente_telefone: string
          comprovante_url: string | null
          created_at: string
          data: string
          eh_fracionado: boolean
          espera_duracao: number | null
          fase1_duracao: number | null
          fase2_duracao: number | null
          hora: string
          id: string
          pix_gerado_em: string | null
          servico_ids: string[]
          sinal_pago: boolean
          status: string
          taxa_app: number
          valor_pago: number | null
          valor_sinal: number | null
        }
        Insert: {
          arquivado?: boolean
          barbeiro_id?: string | null
          barbeiro_nome?: string | null
          cliente_id?: string | null
          cliente_nome: string
          cliente_sobrenome: string
          cliente_telefone: string
          comprovante_url?: string | null
          created_at?: string
          data: string
          eh_fracionado?: boolean
          espera_duracao?: number | null
          fase1_duracao?: number | null
          fase2_duracao?: number | null
          hora: string
          id?: string
          pix_gerado_em?: string | null
          servico_ids: string[]
          sinal_pago?: boolean
          status?: string
          taxa_app?: number
          valor_pago?: number | null
          valor_sinal?: number | null
        }
        Update: {
          arquivado?: boolean
          barbeiro_id?: string | null
          barbeiro_nome?: string | null
          cliente_id?: string | null
          cliente_nome?: string
          cliente_sobrenome?: string
          cliente_telefone?: string
          comprovante_url?: string | null
          created_at?: string
          data?: string
          eh_fracionado?: boolean
          espera_duracao?: number | null
          fase1_duracao?: number | null
          fase2_duracao?: number | null
          hora?: string
          id?: string
          pix_gerado_em?: string | null
          servico_ids?: string[]
          sinal_pago?: boolean
          status?: string
          taxa_app?: number
          valor_pago?: number | null
          valor_sinal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_events: {
        Row: {
          animacao: string
          ativo: boolean
          auto_ativar: boolean
          banner_texto: string | null
          banner_url: string | null
          categoria: string
          cor_primaria: string | null
          cor_secundaria: string | null
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          descricao: string | null
          dia_fim: number | null
          dia_inicio: number | null
          emoji: string | null
          id: string
          logo_url: string | null
          mes_fim: number | null
          mes_inicio: number | null
          nome: string
          pais: string | null
          recorrente_anual: boolean
          updated_at: string
          video_url_horizontal: string | null
          video_url_horizontal_webm: string | null
          video_url_vertical: string | null
          video_url_vertical_webm: string | null
        }
        Insert: {
          animacao?: string
          ativo?: boolean
          auto_ativar?: boolean
          banner_texto?: string | null
          banner_url?: string | null
          categoria?: string
          cor_primaria?: string | null
          cor_secundaria?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          dia_fim?: number | null
          dia_inicio?: number | null
          emoji?: string | null
          id?: string
          logo_url?: string | null
          mes_fim?: number | null
          mes_inicio?: number | null
          nome: string
          pais?: string | null
          recorrente_anual?: boolean
          updated_at?: string
          video_url_horizontal?: string | null
          video_url_horizontal_webm?: string | null
          video_url_vertical?: string | null
          video_url_vertical_webm?: string | null
        }
        Update: {
          animacao?: string
          ativo?: boolean
          auto_ativar?: boolean
          banner_texto?: string | null
          banner_url?: string | null
          categoria?: string
          cor_primaria?: string | null
          cor_secundaria?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          dia_fim?: number | null
          dia_inicio?: number | null
          emoji?: string | null
          id?: string
          logo_url?: string | null
          mes_fim?: number | null
          mes_inicio?: number | null
          nome?: string
          pais?: string | null
          recorrente_anual?: boolean
          updated_at?: string
          video_url_horizontal?: string | null
          video_url_horizontal_webm?: string | null
          video_url_vertical?: string | null
          video_url_vertical_webm?: string | null
        }
        Relationships: []
      }
      avaliacoes: {
        Row: {
          adm_id: string
          agendamento_id: string
          cliente_id: string
          comentario: string | null
          created_at: string
          id: string
          nota: number
        }
        Insert: {
          adm_id: string
          agendamento_id: string
          cliente_id: string
          comentario?: string | null
          created_at?: string
          id?: string
          nota: number
        }
        Update: {
          adm_id?: string
          agendamento_id?: string
          cliente_id?: string
          comentario?: string | null
          created_at?: string
          id?: string
          nota?: number
        }
        Relationships: [
          {
            foreignKeyName: "avaliacoes_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: true
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      barber_payments: {
        Row: {
          amount: number
          barber_id: string
          created_at: string
          deleted_at: string | null
          id: string
          metodo: string | null
          observacoes: string | null
          paid_by: string | null
          period_end: string | null
          period_start: string | null
          shop_owner_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          barber_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          metodo?: string | null
          observacoes?: string | null
          paid_by?: string | null
          period_end?: string | null
          period_start?: string | null
          shop_owner_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          barber_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          metodo?: string | null
          observacoes?: string | null
          paid_by?: string | null
          period_end?: string | null
          period_start?: string | null
          shop_owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      barbershop_team: {
        Row: {
          active: boolean
          allow_own_mp: boolean
          barber_id: string
          commission_type: string
          commission_value: number
          created_at: string
          id: string
          pay_frequency: string
          shop_owner_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          allow_own_mp?: boolean
          barber_id: string
          commission_type?: string
          commission_value?: number
          created_at?: string
          id?: string
          pay_frequency?: string
          shop_owner_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          allow_own_mp?: boolean
          barber_id?: string
          commission_type?: string
          commission_value?: number
          created_at?: string
          id?: string
          pay_frequency?: string
          shop_owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      chats_arquivados: {
        Row: {
          created_at: string
          id: string
          partner_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          partner_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          partner_id?: string
          user_id?: string
        }
        Relationships: []
      }
      cliente_planos: {
        Row: {
          cliente_id: string
          confirmado_em: string | null
          confirmado_por: string | null
          created_at: string
          id: string
          inicio: string
          plano_id: string
          shop_owner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          cliente_id: string
          confirmado_em?: string | null
          confirmado_por?: string | null
          created_at?: string
          id?: string
          inicio?: string
          plano_id: string
          shop_owner_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          confirmado_em?: string | null
          confirmado_por?: string | null
          created_at?: string
          id?: string
          inicio?: string
          plano_id?: string
          shop_owner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_planos_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes: {
        Row: {
          dias_funcionamento: number[]
          duracao_slot: number
          hora_fim: number
          hora_inicio: number
          id: string
          nome_barbearia: string
          shop_owner_id: string | null
          updated_at: string
        }
        Insert: {
          dias_funcionamento?: number[]
          duracao_slot?: number
          hora_fim?: number
          hora_inicio?: number
          id?: string
          nome_barbearia?: string
          shop_owner_id?: string | null
          updated_at?: string
        }
        Update: {
          dias_funcionamento?: number[]
          duracao_slot?: number
          hora_fim?: number
          hora_inicio?: number
          id?: string
          nome_barbearia?: string
          shop_owner_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      configuracoes_barbeiro: {
        Row: {
          barbeiro_id: string
          dias_funcionamento: number[]
          duracao_slot: number
          fechado_hoje_data: string | null
          fechado_hoje_hora: string | null
          hora_fim: number
          hora_inicio: number
          id: string
          limite_agendamento_hora: number | null
          updated_at: string
        }
        Insert: {
          barbeiro_id: string
          dias_funcionamento?: number[]
          duracao_slot?: number
          fechado_hoje_data?: string | null
          fechado_hoje_hora?: string | null
          hora_fim?: number
          hora_inicio?: number
          id?: string
          limite_agendamento_hora?: number | null
          updated_at?: string
        }
        Update: {
          barbeiro_id?: string
          dias_funcionamento?: number[]
          duracao_slot?: number
          fechado_hoje_data?: string | null
          fechado_hoje_hora?: string | null
          hora_fim?: number
          hora_inicio?: number
          id?: string
          limite_agendamento_hora?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      despesas: {
        Row: {
          categoria: string
          created_at: string
          criado_por: string | null
          data: string
          descricao: string
          id: string
          recorrente: boolean
          shop_owner_id: string
          updated_at: string
          valor: number
        }
        Insert: {
          categoria?: string
          created_at?: string
          criado_por?: string | null
          data?: string
          descricao: string
          id?: string
          recorrente?: boolean
          shop_owner_id: string
          updated_at?: string
          valor?: number
        }
        Update: {
          categoria?: string
          created_at?: string
          criado_por?: string | null
          data?: string
          descricao?: string
          id?: string
          recorrente?: boolean
          shop_owner_id?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      evolution_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          barbeiro_id: string | null
          created_at: string
          detail: Json | null
          id: string
          instance: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          barbeiro_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          instance?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          barbeiro_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          instance?: string | null
        }
        Relationships: []
      }
      evolution_config: {
        Row: {
          antiban_enabled: boolean
          api_key: string | null
          api_url: string | null
          barbeiro_id: string | null
          business_hours_end: number
          business_hours_start: number
          connected_at: string | null
          disconnected_at: string | null
          id: string
          instance: string | null
          last_qr_at: string | null
          last_status: string | null
          max_per_day: number
          max_per_hour: number
          min_gap_seconds: number
          paired: boolean
          phone_number: string | null
          presence_simulation: boolean
          retorno_dias: number
          retorno_enabled: boolean
          updated_at: string
          warmup_mode: boolean
        }
        Insert: {
          antiban_enabled?: boolean
          api_key?: string | null
          api_url?: string | null
          barbeiro_id?: string | null
          business_hours_end?: number
          business_hours_start?: number
          connected_at?: string | null
          disconnected_at?: string | null
          id?: string
          instance?: string | null
          last_qr_at?: string | null
          last_status?: string | null
          max_per_day?: number
          max_per_hour?: number
          min_gap_seconds?: number
          paired?: boolean
          phone_number?: string | null
          presence_simulation?: boolean
          retorno_dias?: number
          retorno_enabled?: boolean
          updated_at?: string
          warmup_mode?: boolean
        }
        Update: {
          antiban_enabled?: boolean
          api_key?: string | null
          api_url?: string | null
          barbeiro_id?: string | null
          business_hours_end?: number
          business_hours_start?: number
          connected_at?: string | null
          disconnected_at?: string | null
          id?: string
          instance?: string | null
          last_qr_at?: string | null
          last_status?: string | null
          max_per_day?: number
          max_per_hour?: number
          min_gap_seconds?: number
          paired?: boolean
          phone_number?: string | null
          presence_simulation?: boolean
          retorno_dias?: number
          retorno_enabled?: boolean
          updated_at?: string
          warmup_mode?: boolean
        }
        Relationships: []
      }
      evolution_webhook_logs: {
        Row: {
          created_at: string
          event: string
          external_id: string | null
          id: string
          instance: string | null
          matched: boolean
          payload: Json | null
          queue_id: string | null
          remote_jid: string | null
          status: string | null
        }
        Insert: {
          created_at?: string
          event: string
          external_id?: string | null
          id?: string
          instance?: string | null
          matched?: boolean
          payload?: Json | null
          queue_id?: string | null
          remote_jid?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          external_id?: string | null
          id?: string
          instance?: string | null
          matched?: boolean
          payload?: Json | null
          queue_id?: string | null
          remote_jid?: string | null
          status?: string | null
        }
        Relationships: []
      }
      financial_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          amount: number | null
          barber_id: string | null
          created_at: string
          details: Json | null
          id: string
          payment_id: string | null
          shop_owner_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          amount?: number | null
          barber_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          payment_id?: string | null
          shop_owner_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          amount?: number | null
          barber_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          payment_id?: string | null
          shop_owner_id?: string | null
        }
        Relationships: []
      }
      galeria_fotos: {
        Row: {
          adm_id: string
          created_at: string
          descricao: string | null
          id: string
          url_foto: string
        }
        Insert: {
          adm_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          url_foto: string
        }
        Update: {
          adm_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          url_foto?: string
        }
        Relationships: []
      }
      horarios_bloqueados: {
        Row: {
          created_at: string
          data: string
          hora: string
          id: string
          motivo: string | null
          shop_owner_id: string | null
        }
        Insert: {
          created_at?: string
          data: string
          hora: string
          id?: string
          motivo?: string | null
          shop_owner_id?: string | null
        }
        Update: {
          created_at?: string
          data?: string
          hora?: string
          id?: string
          motivo?: string | null
          shop_owner_id?: string | null
        }
        Relationships: []
      }
      internal_secrets: {
        Row: {
          name: string
          updated_at: string
          value: string
        }
        Insert: {
          name: string
          updated_at?: string
          value: string
        }
        Update: {
          name?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      marketplace_pedidos: {
        Row: {
          amount_app_fee: number
          amount_net: number
          comprador_id: string | null
          comprador_nome: string | null
          comprador_telefone: string | null
          created_at: string
          id: string
          payment_id: string | null
          preference_id: string | null
          produto_id: string | null
          produto_nome: string
          quantidade: number
          shop_owner_id: string
          status: string
          updated_at: string
          valor_total: number
          valor_unitario: number
        }
        Insert: {
          amount_app_fee?: number
          amount_net?: number
          comprador_id?: string | null
          comprador_nome?: string | null
          comprador_telefone?: string | null
          created_at?: string
          id?: string
          payment_id?: string | null
          preference_id?: string | null
          produto_id?: string | null
          produto_nome: string
          quantidade?: number
          shop_owner_id: string
          status?: string
          updated_at?: string
          valor_total: number
          valor_unitario: number
        }
        Update: {
          amount_app_fee?: number
          amount_net?: number
          comprador_id?: string | null
          comprador_nome?: string | null
          comprador_telefone?: string | null
          created_at?: string
          id?: string
          payment_id?: string | null
          preference_id?: string | null
          produto_id?: string | null
          produto_nome?: string
          quantidade?: number
          shop_owner_id?: string
          status?: string
          updated_at?: string
          valor_total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_pedidos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "marketplace_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_produtos: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          estoque: number
          id: string
          imagem_url: string | null
          nome: string
          preco: number
          shop_owner_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          estoque?: number
          id?: string
          imagem_url?: string | null
          nome: string
          preco: number
          shop_owner_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          estoque?: number
          id?: string
          imagem_url?: string | null
          nome?: string
          preco?: number
          shop_owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      mensagens: {
        Row: {
          apagada_destinatario: boolean
          apagada_remetente: boolean
          conteudo: string
          created_at: string
          destinatario_id: string
          entregue: boolean
          entregue_em: string | null
          id: string
          lida: boolean
          lida_em: string | null
          remetente_id: string
        }
        Insert: {
          apagada_destinatario?: boolean
          apagada_remetente?: boolean
          conteudo: string
          created_at?: string
          destinatario_id: string
          entregue?: boolean
          entregue_em?: string | null
          id?: string
          lida?: boolean
          lida_em?: string | null
          remetente_id: string
        }
        Update: {
          apagada_destinatario?: boolean
          apagada_remetente?: boolean
          conteudo?: string
          created_at?: string
          destinatario_id?: string
          entregue?: boolean
          entregue_em?: string | null
          id?: string
          lida?: boolean
          lida_em?: string | null
          remetente_id?: string
        }
        Relationships: []
      }
      mp_credentials: {
        Row: {
          access_token: string
          barber_id: string
          created_at: string
          expires_at: string | null
          id: string
          is_test: boolean
          mp_user_id: string
          public_key: string | null
          refresh_token: string | null
          scope: string | null
          shop_owner_id: string
          updated_at: string
        }
        Insert: {
          access_token: string
          barber_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_test?: boolean
          mp_user_id: string
          public_key?: string | null
          refresh_token?: string | null
          scope?: string | null
          shop_owner_id: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          barber_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_test?: boolean
          mp_user_id?: string
          public_key?: string | null
          refresh_token?: string | null
          scope?: string | null
          shop_owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      notificacoes: {
        Row: {
          agendamento_id: string | null
          created_at: string
          id: string
          lida: boolean
          mensagem: string
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          agendamento_id?: string | null
          created_at?: string
          id?: string
          lida?: boolean
          mensagem: string
          tipo?: string
          titulo: string
          user_id: string
        }
        Update: {
          agendamento_id?: string | null
          created_at?: string
          id?: string
          lida?: boolean
          mensagem?: string
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_logs: {
        Row: {
          agendamento_id: string | null
          amount_app_fee: number
          amount_barber: number
          amount_card_fee: number
          amount_net: number
          amount_shop: number
          amount_total: number
          barber_id: string | null
          commission_type: string | null
          commission_value: number | null
          created_at: string
          id: string
          payload: Json | null
          payment_id: string | null
          payment_method: string | null
          preference_id: string | null
          shop_owner_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          agendamento_id?: string | null
          amount_app_fee?: number
          amount_barber?: number
          amount_card_fee?: number
          amount_net?: number
          amount_shop?: number
          amount_total?: number
          barber_id?: string | null
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          id?: string
          payload?: Json | null
          payment_id?: string | null
          payment_method?: string | null
          preference_id?: string | null
          shop_owner_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          agendamento_id?: string | null
          amount_app_fee?: number
          amount_barber?: number
          amount_card_fee?: number
          amount_net?: number
          amount_shop?: number
          amount_total?: number
          barber_id?: string | null
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          id?: string
          payload?: Json | null
          payment_id?: string | null
          payment_method?: string | null
          preference_id?: string | null
          shop_owner_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      plano_consumo: {
        Row: {
          agendamento_id: string
          cliente_plano_id: string
          created_at: string
          id: string
          periodo: string
          quantidade: number
          servico_id: string
        }
        Insert: {
          agendamento_id: string
          cliente_plano_id: string
          created_at?: string
          id?: string
          periodo: string
          quantidade?: number
          servico_id: string
        }
        Update: {
          agendamento_id?: string
          cliente_plano_id?: string
          created_at?: string
          id?: string
          periodo?: string
          quantidade?: number
          servico_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plano_consumo_cliente_plano_id_fkey"
            columns: ["cliente_plano_id"]
            isOneToOne: false
            referencedRelation: "cliente_planos"
            referencedColumns: ["id"]
          },
        ]
      }
      plano_servicos: {
        Row: {
          created_at: string
          id: string
          limite_mensal: number | null
          plano_id: string
          servico_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          limite_mensal?: number | null
          plano_id: string
          servico_id: string
        }
        Update: {
          created_at?: string
          id?: string
          limite_mensal?: number | null
          plano_id?: string
          servico_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plano_servicos_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_servicos_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          preco: number
          shop_owner_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          preco?: number
          shop_owner_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          preco?: number
          shop_owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_subscriptions: {
        Row: {
          base_amount: number
          created_at: string
          due_date: string
          id: string
          notes: string | null
          paid_at: string | null
          payment_id: string | null
          per_barber_amount: number
          period_month: string
          shop_owner_id: string
          status: string
          team_count: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          base_amount?: number
          created_at?: string
          due_date: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_id?: string | null
          per_barber_amount?: number
          period_month: string
          shop_owner_id: string
          status?: string
          team_count?: number
          total_amount: number
          updated_at?: string
        }
        Update: {
          base_amount?: number
          created_at?: string
          due_date?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_id?: string | null
          per_barber_amount?: number
          period_month?: string
          shop_owner_id?: string
          status?: string
          team_count?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          adm_responsavel_id: string | null
          app_bg_opacity: number
          app_bg_url: string | null
          app_logo_url: string | null
          avatar_url: string | null
          barberhub_link: string | null
          chave_pix: string | null
          comodidades: string[]
          data_nascimento: string | null
          endereco_completo: string | null
          full_name: string | null
          hero_image_url: string | null
          hero_object_fit: string | null
          hero_object_position: string | null
          id: string
          idioma: string | null
          invite_code: string | null
          latitude: number | null
          link_google_maps: string | null
          link_planos: string | null
          longitude: number | null
          nome_barbearia: string | null
          passkey_enabled: boolean
          plano_enabled: boolean | null
          plano_modo: string | null
          qr_code_pix_url: string | null
          sinal_modo: string
          sinal_percentual: number
          taxa_app_valor: number
          taxa_isenta_ate: string | null
          telefone: string | null
          tema_cores: Json | null
          updated_at: string | null
          vinculo_em: string | null
        }
        Insert: {
          adm_responsavel_id?: string | null
          app_bg_opacity?: number
          app_bg_url?: string | null
          app_logo_url?: string | null
          avatar_url?: string | null
          barberhub_link?: string | null
          chave_pix?: string | null
          comodidades?: string[]
          data_nascimento?: string | null
          endereco_completo?: string | null
          full_name?: string | null
          hero_image_url?: string | null
          hero_object_fit?: string | null
          hero_object_position?: string | null
          id: string
          idioma?: string | null
          invite_code?: string | null
          latitude?: number | null
          link_google_maps?: string | null
          link_planos?: string | null
          longitude?: number | null
          nome_barbearia?: string | null
          passkey_enabled?: boolean
          plano_enabled?: boolean | null
          plano_modo?: string | null
          qr_code_pix_url?: string | null
          sinal_modo?: string
          sinal_percentual?: number
          taxa_app_valor?: number
          taxa_isenta_ate?: string | null
          telefone?: string | null
          tema_cores?: Json | null
          updated_at?: string | null
          vinculo_em?: string | null
        }
        Update: {
          adm_responsavel_id?: string | null
          app_bg_opacity?: number
          app_bg_url?: string | null
          app_logo_url?: string | null
          avatar_url?: string | null
          barberhub_link?: string | null
          chave_pix?: string | null
          comodidades?: string[]
          data_nascimento?: string | null
          endereco_completo?: string | null
          full_name?: string | null
          hero_image_url?: string | null
          hero_object_fit?: string | null
          hero_object_position?: string | null
          id?: string
          idioma?: string | null
          invite_code?: string | null
          latitude?: number | null
          link_google_maps?: string | null
          link_planos?: string | null
          longitude?: number | null
          nome_barbearia?: string | null
          passkey_enabled?: boolean
          plano_enabled?: boolean | null
          plano_modo?: string | null
          qr_code_pix_url?: string | null
          sinal_modo?: string
          sinal_percentual?: number
          taxa_app_valor?: number
          taxa_isenta_ate?: string | null
          telefone?: string | null
          tema_cores?: Json | null
          updated_at?: string | null
          vinculo_em?: string | null
        }
        Relationships: []
      }
      promocoes: {
        Row: {
          adm_id: string
          ativa: boolean
          created_at: string
          descricao: string
          disponivel_ate: string | null
          disponivel_de: string | null
          id: string
          preco_original: string | null
          preco_promocional: string | null
          titulo: string
        }
        Insert: {
          adm_id: string
          ativa?: boolean
          created_at?: string
          descricao: string
          disponivel_ate?: string | null
          disponivel_de?: string | null
          id?: string
          preco_original?: string | null
          preco_promocional?: string | null
          titulo: string
        }
        Update: {
          adm_id?: string
          ativa?: boolean
          created_at?: string
          descricao?: string
          disponivel_ate?: string | null
          disponivel_de?: string | null
          id?: string
          preco_original?: string | null
          preco_promocional?: string | null
          titulo?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          allowed: boolean
          created_at: string
          details: Json | null
          event_type: string
          id: string
          resource: string | null
          user_id: string | null
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          resource?: string | null
          user_id?: string | null
        }
        Update: {
          allowed?: boolean
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          resource?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      servicos: {
        Row: {
          categoria: string | null
          created_at: string
          duracao: number
          duracao_espera: number | null
          duracao_fase1: number | null
          duracao_fase2: number | null
          eh_fracionado: boolean
          foto_url: string | null
          id: string
          nome: string
          preco: number
          shop_owner_id: string | null
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          duracao: number
          duracao_espera?: number | null
          duracao_fase1?: number | null
          duracao_fase2?: number | null
          eh_fracionado?: boolean
          foto_url?: string | null
          id?: string
          nome: string
          preco: number
          shop_owner_id?: string | null
        }
        Update: {
          categoria?: string | null
          created_at?: string
          duracao?: number
          duracao_espera?: number | null
          duracao_fase1?: number | null
          duracao_fase2?: number | null
          eh_fracionado?: boolean
          foto_url?: string | null
          id?: string
          nome?: string
          preco?: number
          shop_owner_id?: string | null
        }
        Relationships: []
      }
      sobre: {
        Row: {
          conteudo: string
          id: string
          shop_owner_id: string | null
          updated_at: string
        }
        Insert: {
          conteudo?: string
          id?: string
          shop_owner_id?: string | null
          updated_at?: string
        }
        Update: {
          conteudo?: string
          id?: string
          shop_owner_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      suporte: {
        Row: {
          adm_id: string
          assunto: string
          created_at: string
          id: string
          mensagem: string
          resposta: string | null
          status: string
        }
        Insert: {
          adm_id: string
          assunto: string
          created_at?: string
          id?: string
          mensagem: string
          resposta?: string | null
          status?: string
        }
        Update: {
          adm_id?: string
          assunto?: string
          created_at?: string
          id?: string
          mensagem?: string
          resposta?: string | null
          status?: string
        }
        Relationships: []
      }
      suporte_mensagens: {
        Row: {
          conteudo: string
          created_at: string
          id: string
          sender_id: string
          ticket_id: string
        }
        Insert: {
          conteudo: string
          created_at?: string
          id?: string
          sender_id: string
          ticket_id: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          id?: string
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suporte_mensagens_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "suporte"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          display_name: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          display_name?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          display_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webauthn_challenges: {
        Row: {
          challenge: string
          created_at: string
          expires_at: string
          id: string
          kind: string
          user_id: string | null
        }
        Insert: {
          challenge: string
          created_at?: string
          expires_at?: string
          id?: string
          kind: string
          user_id?: string | null
        }
        Update: {
          challenge?: string
          created_at?: string
          expires_at?: string
          id?: string
          kind?: string
          user_id?: string | null
        }
        Relationships: []
      }
      webauthn_credentials: {
        Row: {
          counter: number
          created_at: string
          credential_id: string
          device_label: string | null
          id: string
          last_used_at: string | null
          public_key: string
          transports: string[] | null
          user_id: string
        }
        Insert: {
          counter?: number
          created_at?: string
          credential_id: string
          device_label?: string | null
          id?: string
          last_used_at?: string | null
          public_key: string
          transports?: string[] | null
          user_id: string
        }
        Update: {
          counter?: number
          created_at?: string
          credential_id?: string
          device_label?: string | null
          id?: string
          last_used_at?: string | null
          public_key?: string
          transports?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_queue: {
        Row: {
          agendamento_id: string | null
          barbeiro_id: string | null
          created_at: string
          delivered_at: string | null
          destinatario: string
          erro: string | null
          external_id: string | null
          id: string
          max_tentativas: number
          mensagem: string
          next_attempt_at: string
          read_at: string | null
          resposta: Json | null
          sent_at: string | null
          status: string
          tentativas: number
          tipo: string | null
        }
        Insert: {
          agendamento_id?: string | null
          barbeiro_id?: string | null
          created_at?: string
          delivered_at?: string | null
          destinatario: string
          erro?: string | null
          external_id?: string | null
          id?: string
          max_tentativas?: number
          mensagem: string
          next_attempt_at?: string
          read_at?: string | null
          resposta?: Json | null
          sent_at?: string | null
          status?: string
          tentativas?: number
          tipo?: string | null
        }
        Update: {
          agendamento_id?: string | null
          barbeiro_id?: string | null
          created_at?: string
          delivered_at?: string | null
          destinatario?: string
          erro?: string | null
          external_id?: string | null
          id?: string
          max_tentativas?: number
          mensagem?: string
          next_attempt_at?: string
          read_at?: string | null
          resposta?: Json | null
          sent_at?: string | null
          status?: string
          tentativas?: number
          tipo?: string | null
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          ativo: boolean
          conteudo: string
          id: string
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          conteudo: string
          id?: string
          tipo: string
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          conteudo?: string
          id?: string
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_reparent_identity: {
        Args: { _from: string; _provider: string; _to: string }
        Returns: number
      }
      am_i_blocked: { Args: never; Returns: boolean }
      audit_realtime_access: { Args: { _topic: string }; Returns: undefined }
      barber_earnings_dashboard: {
        Args: { _from?: string; _to?: string }
        Returns: {
          amount_paid: number
          avatar_url: string
          avg_ticket: number
          barber_id: string
          barber_name: string
          commission_amount: number
          commission_type: string
          commission_value: number
          is_owner: boolean
          pay_frequency: string
          status: string
          total_appointments: number
          total_revenue: number
        }[]
      }
      barber_payment_history: {
        Args: { _barber_id?: string }
        Returns: {
          amount: number
          barber_id: string
          created_at: string
          id: string
          metodo: string
          observacoes: string
          paid_by: string
          paid_by_name: string
          period_end: string
          period_start: string
        }[]
      }
      barber_service_history: {
        Args: { _barber_id: string; _from?: string; _to?: string }
        Returns: {
          agendamento_id: string
          cliente_nome: string
          data: string
          hora: string
          servicos: string
          status: string
          valor: number
        }[]
      }
      can_access_comprovante: {
        Args: { _agendamento_id: string; _user_id: string }
        Returns: boolean
      }
      can_barber_own_mp: { Args: { _barber_id: string }; Returns: boolean }
      cancel_expired_pix_appointments: { Args: never; Returns: number }
      ceo_get_admin_taxa: {
        Args: { _admin_id: string }
        Returns: {
          taxa_app_valor: number
          taxa_isenta_ate: string
        }[]
      }
      ceo_list_admins_mp_status: {
        Args: never
        Returns: {
          display_name: string
          mp_connected: boolean
          taxa_isenta_ate: string
          user_id: string
        }[]
      }
      cron_enqueue_return_reminders: { Args: never; Returns: undefined }
      cron_generate_invoices: { Args: never; Returns: number }
      cron_process_whatsapp_queue: { Args: never; Returns: undefined }
      delete_barber_payment: { Args: { _id: string }; Returns: undefined }
      ensure_my_invite_code: { Args: never; Returns: string }
      financial_summary: {
        Args: { _from?: string; _shop_owner_id: string; _to?: string }
        Returns: {
          barber_share: number
          gross_revenue: number
          net_profit: number
          platform_fees: number
          shop_share: number
          total_expenses: number
        }[]
      }
      find_barbeiro_by_phone: { Args: { _phone: string }; Returns: string }
      fire_web_push: {
        Args: {
          _body: string
          _tag: string
          _title: string
          _url: string
          _user_id: string
        }
        Returns: undefined
      }
      gen_invite_code: { Args: never; Returns: string }
      generate_all_invoices: { Args: { _period?: string }; Returns: number }
      generate_invoice_for_shop: {
        Args: { _period?: string; _shop_owner_id: string }
        Returns: string
      }
      get_app_pix_key: { Args: never; Returns: string }
      get_barber_location: {
        Args: { _barber_id: string }
        Returns: {
          endereco_completo: string
          link_google_maps: string
        }[]
      }
      get_barber_name: { Args: { _barber_id: string }; Returns: string }
      get_barber_payment_config: {
        Args: { _barber_id: string }
        Returns: {
          mp_connected: boolean
          sinal_modo: string
          sinal_percentual: number
          taxa_app_valor: number
        }[]
      }
      get_barber_pix: {
        Args: { _barber_id: string }
        Returns: {
          chave_pix: string
          full_name: string
          qr_code_pix_url: string
          telefone: string
        }[]
      }
      get_barber_planos_link: { Args: { _barber_id: string }; Returns: string }
      get_barber_shop_owner: { Args: { _barber_id: string }; Returns: string }
      get_barber_taxa: { Args: { _barber_id: string }; Returns: number }
      get_barber_theme: {
        Args: { _barber_id: string }
        Returns: {
          app_bg_opacity: number
          app_bg_url: string
          app_logo_url: string
          comodidades: string[]
          hero_image_url: string
          hero_object_fit: string
          hero_object_position: string
          link_planos: string
          plano_enabled: boolean
          plano_modo: string
          tema_cores: Json
        }[]
      }
      get_barbers: {
        Args: never
        Returns: {
          display_name: string
          user_id: string
        }[]
      }
      get_blocked_slots: {
        Args: { _data_inicio?: string; _dias?: number }
        Returns: {
          data: string
          hora: string
          id: string
          shop_owner_id: string
        }[]
      }
      get_busy_slots: {
        Args: { _data_inicio?: string; _dias?: number }
        Returns: {
          arquivado: boolean
          barbeiro_id: string
          data: string
          eh_fracionado: boolean
          espera_duracao: number
          fase1_duracao: number
          fase2_duracao: number
          hora: string
          id: string
          servico_ids: string[]
          status: string
        }[]
      }
      get_comprovante_signed_url: {
        Args: { _agendamento_id: string }
        Returns: string
      }
      get_my_payment_profile: {
        Args: never
        Returns: {
          chave_pix: string
          invite_code: string
          qr_code_pix_url: string
          sinal_modo: string
          sinal_percentual: number
          taxa_app_valor: number
        }[]
      }
      get_my_plan_coverage: {
        Args: { _barber_id: string }
        Returns: {
          limite_mensal: number
          plano_nome: string
          restante: number
          servico_id: string
          usados: number
        }[]
      }
      get_my_shop_owner: { Args: never; Returns: string }
      get_my_subscription_status: {
        Args: never
        Returns: {
          base_amount: number
          due_date: string
          id: string
          paid_at: string
          per_barber_amount: number
          period_month: string
          status: string
          team_count: number
          total_amount: number
        }[]
      }
      get_services_for_barber: {
        Args: { _barber_id: string }
        Returns: {
          duracao: number
          duracao_espera: number
          duracao_fase1: number
          duracao_fase2: number
          eh_fracionado: boolean
          id: string
          nome: string
          preco: number
        }[]
      }
      get_shop_barberhub_link: { Args: { _barber_id: string }; Returns: string }
      get_shop_config_for_barber: {
        Args: { _barber_id: string }
        Returns: {
          dias_funcionamento: number[]
          duracao_slot: number
          hora_fim: number
          hora_inicio: number
          nome_barbearia: string
        }[]
      }
      get_shop_location: {
        Args: never
        Returns: {
          endereco_completo: string
          link_google_maps: string
        }[]
      }
      get_shop_owner: { Args: { _user_id: string }; Returns: string }
      get_subscription_prices: {
        Args: never
        Returns: {
          base_price: number
          per_barber_price: number
        }[]
      }
      get_visible_shop_owner: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_client_of: { Args: { _barber_id: string }; Returns: boolean }
      is_shop_blocked: { Args: { _shop_owner_id: string }; Returns: boolean }
      is_shop_member: {
        Args: { _shop_owner_id: string; _user_id: string }
        Returns: boolean
      }
      link_self_to_barber: { Args: { _barber_id: string }; Returns: undefined }
      list_agendamentos_full: {
        Args: { _id?: string }
        Returns: {
          arquivado: boolean
          barbeiro_id: string | null
          barbeiro_nome: string | null
          cliente_id: string | null
          cliente_nome: string
          cliente_sobrenome: string
          cliente_telefone: string
          comprovante_url: string | null
          created_at: string
          data: string
          eh_fracionado: boolean
          espera_duracao: number | null
          fase1_duracao: number | null
          fase2_duracao: number | null
          hora: string
          id: string
          pix_gerado_em: string | null
          servico_ids: string[]
          sinal_pago: boolean
          status: string
          taxa_app: number
          valor_pago: number | null
          valor_sinal: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "agendamentos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_all_subscriptions: {
        Args: { _status?: string }
        Returns: {
          due_date: string
          id: string
          paid_at: string
          period_month: string
          shop_name: string
          shop_owner_id: string
          status: string
          team_count: number
          total_amount: number
        }[]
      }
      list_barbers_of_shop: {
        Args: { _shop_owner_id: string }
        Returns: {
          allow_own_mp: boolean
          avatar_url: string
          commission_type: string
          commission_value: number
          display_name: string
          full_name: string
          is_owner: boolean
          rating_avg: number
          rating_count: number
          user_id: string
        }[]
      }
      list_barbers_showcase: {
        Args: never
        Returns: {
          avatar_url: string
          display_name: string
          full_name: string
          nome_barbearia: string
          rating_avg: number
          rating_count: number
          user_id: string
        }[]
      }
      list_my_shop_team: {
        Args: never
        Returns: {
          display_name: string
          is_owner: boolean
          user_id: string
        }[]
      }
      list_shops_geo: {
        Args: never
        Returns: {
          avatar_url: string
          display_name: string
          endereco_completo: string
          latitude: number
          longitude: number
          rating_avg: number
          rating_count: number
          shop_name: string
          shop_owner_id: string
        }[]
      }
      list_shops_showcase: {
        Args: never
        Returns: {
          avatar_url: string
          display_name: string
          rating_avg: number
          rating_count: number
          shop_name: string
          shop_owner_id: string
          team_size: number
        }[]
      }
      list_whatsapp_queue: {
        Args: { _barbeiro_id?: string; _limit?: number }
        Returns: {
          agendamento_id: string
          barbeiro_id: string
          created_at: string
          delivered_at: string
          destinatario: string
          erro: string
          external_id: string
          id: string
          max_tentativas: number
          mensagem: string
          next_attempt_at: string
          read_at: string
          resposta: Json
          sent_at: string
          status: string
          tentativas: number
          tipo: string
        }[]
      }
      mark_subscription_paid: {
        Args: { _id: string; _notes?: string; _payment_id?: string }
        Returns: undefined
      }
      marketplace_confirm_order: {
        Args: { _payment_id: string; _pedido_id: string }
        Returns: undefined
      }
      marketplace_feed: {
        Args: never
        Returns: {
          comprador_nome: string
          created_at: string
          id: string
          produto_nome: string
          quantidade: number
          status: string
          valor_total: number
        }[]
      }
      mp_is_connected: { Args: { _shop_owner_id: string }; Returns: boolean }
      register_barber_payment: {
        Args: {
          _amount: number
          _barber_id: string
          _metodo?: string
          _observacoes?: string
          _period_end?: string
          _period_start?: string
        }
        Returns: string
      }
      resolve_invite_code: { Args: { _code: string }; Returns: string }
      restore_barber_payment: { Args: { _id: string }; Returns: undefined }
      seed_default_services: { Args: { _owner: string }; Returns: undefined }
      set_app_pix_key: { Args: { _key: string }; Returns: undefined }
      set_subscription_prices: {
        Args: { _base: number; _per_barber: number }
        Returns: undefined
      }
      shop_dashboard: {
        Args: { _from?: string; _shop_owner_id: string; _to?: string }
        Returns: {
          barber_id: string
          barber_name: string
          total_appointments: number
          total_barber_share: number
          total_revenue: number
          total_shop_share: number
        }[]
      }
      unlink_self_from_barber: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "ceo" | "admin"
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
      app_role: ["ceo", "admin"],
    },
  },
} as const
