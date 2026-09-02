export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      clientes: {
        Row: {
          activo: boolean
          actualizado_en: string
          creado_en: string
          direccion: string | null
          email: string | null
          id_cliente: number
          nombre: string
          ruc: string | null
          telefono: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          creado_en?: string
          direccion?: string | null
          email?: string | null
          id_cliente?: number
          nombre: string
          ruc?: string | null
          telefono?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          creado_en?: string
          direccion?: string | null
          email?: string | null
          id_cliente?: number
          nombre?: string
          ruc?: string | null
          telefono?: string | null
        }
        Relationships: []
      }
      detalle_ventas: {
        Row: {
          cantidad: number
          codigo_barras: string
          id_detalle: number
          id_venta: number
          precio_unitario: number
        }
        Insert: {
          cantidad: number
          codigo_barras: string
          id_detalle?: number
          id_venta: number
          precio_unitario: number
        }
        Update: {
          cantidad?: number
          codigo_barras?: string
          id_detalle?: number
          id_venta?: number
          precio_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "detalle_ventas_codigo_barras_fkey"
            columns: ["codigo_barras"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["codigo_barras"]
          },
          {
            foreignKeyName: "detalle_ventas_id_venta_fkey"
            columns: ["id_venta"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id_venta"]
          },
        ]
      }
      productos: {
        Row: {
          actualizado_en: string
          codigo_barras: string
          creado_en: string
          iva: number
          nombre: string
          precio_costo: number
          precio_venta: number
          stock: number
        }
        Insert: {
          actualizado_en?: string
          codigo_barras: string
          creado_en?: string
          iva?: number
          nombre: string
          precio_costo: number
          precio_venta: number
          stock?: number
        }
        Update: {
          actualizado_en?: string
          codigo_barras?: string
          creado_en?: string
          iva?: number
          nombre?: string
          precio_costo?: number
          precio_venta?: number
          stock?: number
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          activo: boolean
          contrasena_encriptada: string
          creado_en: string
          id_usuario: number
          nombre_empleado: string
          rol: string
        }
        Insert: {
          activo?: boolean
          contrasena_encriptada: string
          creado_en?: string
          id_usuario?: number
          nombre_empleado: string
          rol: string
        }
        Update: {
          activo?: boolean
          contrasena_encriptada?: string
          creado_en?: string
          id_usuario?: number
          nombre_empleado?: string
          rol?: string
        }
        Relationships: []
      }
      ventas: {
        Row: {
          fecha_hora: string
          id_cliente: number | null
          id_usuario: number | null
          id_venta: number
          monto_recibido: number
          tipo_pago: string
          total_pagado: number
          vuelto: number
        }
        Insert: {
          fecha_hora?: string
          id_cliente?: number | null
          id_usuario?: number | null
          id_venta?: number
          monto_recibido: number
          tipo_pago: string
          total_pagado: number
          vuelto?: number
        }
        Update: {
          fecha_hora?: string
          id_cliente?: number | null
          id_usuario?: number | null
          id_venta?: number
          monto_recibido?: number
          tipo_pago?: string
          total_pagado?: number
          vuelto?: number
        }
        Relationships: [
          {
            foreignKeyName: "ventas_id_cliente_fkey"
            columns: ["id_cliente"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id_cliente"]
          },
          {
            foreignKeyName: "ventas_id_usuario_fkey"
            columns: ["id_usuario"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      registrar_venta: { Args: { p_venta: Json }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

