/**
 * Supabase database types for SCHOOL-HUB.
 *
 * NORMALLY GENERATED, NOT HAND-WRITTEN. Once the cloud project exists, refresh
 * this file instead of editing it:
 *
 *   npx supabase gen types typescript --project-id <ref> --schema public > src/lib/db.types.ts
 *   # or, against a local stack:
 *   npx supabase gen types typescript --local --schema public > src/lib/db.types.ts
 *
 * It is hand-written for now because the Supabase project has not been created
 * yet. It mirrors supabase/migrations/0002_core_tables.sql exactly; if you change
 * a migration, change this file in the same commit.
 *
 * Note on enums: every "enum-like" column in this schema is `text` + a CHECK
 * constraint, not a Postgres enum type, so `Database['public']['Enums']` would be
 * empty in generated output. The unions are declared here as named types and the
 * Enums block re-exports them for convenience.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/* -------------------------------------------------------------------------- */
/* CHECK-constraint unions                                                     */
/* -------------------------------------------------------------------------- */

/** profiles.role, family_members.role */
export type UserRole = 'parent' | 'child' | 'helper'

/** assignments.status, assignment_events.from_status / to_status */
export type AssignmentStatus =
  | 'assigned'
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'redo'

/** attachments.kind */
export type AttachmentKind = 'task_source' | 'solution' | 'review' | 'chat'

/** grades.source */
export type GradeSource = 'teacher' | 'internal'

/** children.ui_mode */
export type ChildUiMode = 'simple' | 'full'

/** assignments.priority — 1 low, 2 normal, 3 high */
export type AssignmentPriority = 1 | 2 | 3

export interface Database {
  public: {
    Tables: {
      /* ------------------------------------------------------------------ */
      profiles: {
        Row: {
          id: string
          role: UserRole
          display_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          role?: UserRole
          display_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          role?: UserRole
          display_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      /* ------------------------------------------------------------------ */
      families: {
        Row: {
          id: string
          name: string
          owner_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          owner_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          owner_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'families_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }

      /* ------------------------------------------------------------------ */
      family_members: {
        Row: {
          id: string
          family_id: string
          user_id: string
          role: UserRole
          permissions: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          family_id: string
          user_id: string
          role: UserRole
          permissions?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          user_id?: string
          role?: UserRole
          permissions?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'family_members_family_id_fkey'
            columns: ['family_id']
            isOneToOne: false
            referencedRelation: 'families'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'family_members_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }

      /* ------------------------------------------------------------------ */
      children: {
        Row: {
          id: string
          family_id: string
          /** The child's own auth user. Null until the invite code is redeemed. */
          profile_id: string | null
          name: string
          grade: number | null
          school: string | null
          birth_date: string | null
          avatar_url: string | null
          color: string
          is_active: boolean
          invite_code: string | null
          invite_expires_at: string | null
          pin_hash: string | null
          pin_attempts: number
          pin_locked_until: string | null
          ui_mode: ChildUiMode
          /** Parent-controlled: may the child see their own statistics. */
          show_own_stats: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          family_id: string
          profile_id?: string | null
          name: string
          grade?: number | null
          school?: string | null
          birth_date?: string | null
          avatar_url?: string | null
          color?: string
          is_active?: boolean
          invite_code?: string | null
          invite_expires_at?: string | null
          pin_hash?: string | null
          pin_attempts?: number
          pin_locked_until?: string | null
          ui_mode?: ChildUiMode
          show_own_stats?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          family_id?: string
          profile_id?: string | null
          name?: string
          grade?: number | null
          school?: string | null
          birth_date?: string | null
          avatar_url?: string | null
          color?: string
          is_active?: boolean
          invite_code?: string | null
          invite_expires_at?: string | null
          pin_hash?: string | null
          pin_attempts?: number
          pin_locked_until?: string | null
          ui_mode?: ChildUiMode
          show_own_stats?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'children_family_id_fkey'
            columns: ['family_id']
            isOneToOne: false
            referencedRelation: 'families'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'children_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }

      /* ------------------------------------------------------------------ */
      subjects: {
        Row: {
          id: string
          child_id: string
          name: string
          color: string
          teacher_name: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          child_id: string
          name: string
          color?: string
          teacher_name?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          child_id?: string
          name?: string
          color?: string
          teacher_name?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'subjects_child_id_fkey'
            columns: ['child_id']
            isOneToOne: false
            referencedRelation: 'children'
            referencedColumns: ['id']
          },
        ]
      }

      /* ------------------------------------------------------------------ */
      schedule_slots: {
        Row: {
          id: string
          child_id: string
          subject_id: string
          /** ISO weekday: 1 = Monday ... 7 = Sunday */
          weekday: number
          start_time: string
          end_time: string
          effective_from: string
          effective_to: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          child_id: string
          subject_id: string
          weekday: number
          start_time: string
          end_time: string
          effective_from?: string
          effective_to?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          child_id?: string
          subject_id?: string
          weekday?: number
          start_time?: string
          end_time?: string
          effective_from?: string
          effective_to?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'schedule_slots_child_id_fkey'
            columns: ['child_id']
            isOneToOne: false
            referencedRelation: 'children'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'schedule_slots_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'subjects'
            referencedColumns: ['id']
          },
        ]
      }

      /* ------------------------------------------------------------------ */
      lessons: {
        Row: {
          id: string
          child_id: string
          subject_id: string | null
          date: string
          topic: string | null
          notes: string | null
          slot_id: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          child_id: string
          subject_id?: string | null
          date?: string
          topic?: string | null
          notes?: string | null
          slot_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          child_id?: string
          subject_id?: string | null
          date?: string
          topic?: string | null
          notes?: string | null
          slot_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'lessons_child_id_fkey'
            columns: ['child_id']
            isOneToOne: false
            referencedRelation: 'children'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lessons_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lessons_slot_id_fkey'
            columns: ['slot_id']
            isOneToOne: false
            referencedRelation: 'schedule_slots'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lessons_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'subjects'
            referencedColumns: ['id']
          },
        ]
      }

      /* ------------------------------------------------------------------ */
      topics: {
        Row: {
          id: string
          subject_id: string
          name: string
          parent_topic_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          subject_id: string
          name: string
          parent_topic_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          subject_id?: string
          name?: string
          parent_topic_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'topics_parent_topic_id_fkey'
            columns: ['parent_topic_id']
            isOneToOne: false
            referencedRelation: 'topics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'topics_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'subjects'
            referencedColumns: ['id']
          },
        ]
      }

      /* ------------------------------------------------------------------ */
      assignments: {
        Row: {
          id: string
          lesson_id: string | null
          child_id: string
          subject_id: string | null
          topic_id: string | null
          title: string
          description: string | null
          /** e.g. "წიგნი გვ. 45, სავარჯიშო 3" */
          source_ref: string | null
          due_date: string | null
          due_time: string | null
          status: AssignmentStatus
          /** 1 low, 2 normal, 3 high */
          priority: number
          /** 1..5, set by the child */
          self_rating: number | null
          difficulty_note: string | null
          minutes_spent: number | null
          redo_count: number
          submitted_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          review_comment: string | null
          /** phase 3 */
          ai_check: Json | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lesson_id?: string | null
          child_id: string
          subject_id?: string | null
          topic_id?: string | null
          title: string
          description?: string | null
          source_ref?: string | null
          due_date?: string | null
          due_time?: string | null
          status?: AssignmentStatus
          priority?: number
          self_rating?: number | null
          difficulty_note?: string | null
          minutes_spent?: number | null
          redo_count?: number
          submitted_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          review_comment?: string | null
          ai_check?: Json | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lesson_id?: string | null
          child_id?: string
          subject_id?: string | null
          topic_id?: string | null
          title?: string
          description?: string | null
          source_ref?: string | null
          due_date?: string | null
          due_time?: string | null
          status?: AssignmentStatus
          priority?: number
          self_rating?: number | null
          difficulty_note?: string | null
          minutes_spent?: number | null
          redo_count?: number
          submitted_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          review_comment?: string | null
          ai_check?: Json | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'assignments_child_id_fkey'
            columns: ['child_id']
            isOneToOne: false
            referencedRelation: 'children'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assignments_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assignments_lesson_id_fkey'
            columns: ['lesson_id']
            isOneToOne: false
            referencedRelation: 'lessons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assignments_reviewed_by_fkey'
            columns: ['reviewed_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assignments_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'subjects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assignments_topic_id_fkey'
            columns: ['topic_id']
            isOneToOne: false
            referencedRelation: 'topics'
            referencedColumns: ['id']
          },
        ]
      }

      /* ------------------------------------------------------------------ */
      assignment_events: {
        Row: {
          id: string
          assignment_id: string
          actor_id: string | null
          from_status: AssignmentStatus | null
          to_status: AssignmentStatus
          comment: string | null
          created_at: string
        }
        /** Append-only: rows are written by DB triggers, never by the client. */
        Insert: {
          id?: string
          assignment_id: string
          actor_id?: string | null
          from_status?: AssignmentStatus | null
          to_status: AssignmentStatus
          comment?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          assignment_id?: string
          actor_id?: string | null
          from_status?: AssignmentStatus | null
          to_status?: AssignmentStatus
          comment?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'assignment_events_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assignment_events_assignment_id_fkey'
            columns: ['assignment_id']
            isOneToOne: false
            referencedRelation: 'assignments'
            referencedColumns: ['id']
          },
        ]
      }

      /* ------------------------------------------------------------------ */
      messages: {
        Row: {
          id: string
          assignment_id: string | null
          lesson_id: string | null
          /** Denormalised from the parent assignment/lesson; filled by a trigger. */
          child_id: string
          author_id: string | null
          body: string | null
          voice_path: string | null
          created_at: string
          edited_at: string | null
        }
        Insert: {
          id?: string
          assignment_id?: string | null
          lesson_id?: string | null
          child_id?: string
          author_id?: string | null
          body?: string | null
          voice_path?: string | null
          created_at?: string
          edited_at?: string | null
        }
        Update: {
          id?: string
          assignment_id?: string | null
          lesson_id?: string | null
          child_id?: string
          author_id?: string | null
          body?: string | null
          voice_path?: string | null
          created_at?: string
          edited_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'messages_assignment_id_fkey'
            columns: ['assignment_id']
            isOneToOne: false
            referencedRelation: 'assignments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'messages_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'messages_child_id_fkey'
            columns: ['child_id']
            isOneToOne: false
            referencedRelation: 'children'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'messages_lesson_id_fkey'
            columns: ['lesson_id']
            isOneToOne: false
            referencedRelation: 'lessons'
            referencedColumns: ['id']
          },
        ]
      }

      /* ------------------------------------------------------------------ */
      message_reads: {
        Row: {
          message_id: string
          user_id: string
          read_at: string
        }
        Insert: {
          message_id: string
          user_id: string
          read_at?: string
        }
        Update: {
          message_id?: string
          user_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'message_reads_message_id_fkey'
            columns: ['message_id']
            isOneToOne: false
            referencedRelation: 'messages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'message_reads_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }

      /* ------------------------------------------------------------------ */
      attachments: {
        Row: {
          id: string
          assignment_id: string | null
          lesson_id: string | null
          message_id: string | null
          /** Denormalised; filled by a trigger when omitted. */
          child_id: string
          kind: AttachmentKind
          /** Object name in the private `evidence` bucket. */
          storage_path: string
          thumb_path: string | null
          mime: string
          size_bytes: number | null
          width: number | null
          height: number | null
          sort_order: number
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          assignment_id?: string | null
          lesson_id?: string | null
          message_id?: string | null
          child_id?: string
          kind: AttachmentKind
          storage_path: string
          thumb_path?: string | null
          mime?: string
          size_bytes?: number | null
          width?: number | null
          height?: number | null
          sort_order?: number
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          assignment_id?: string | null
          lesson_id?: string | null
          message_id?: string | null
          child_id?: string
          kind?: AttachmentKind
          storage_path?: string
          thumb_path?: string | null
          mime?: string
          size_bytes?: number | null
          width?: number | null
          height?: number | null
          sort_order?: number
          uploaded_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'attachments_assignment_id_fkey'
            columns: ['assignment_id']
            isOneToOne: false
            referencedRelation: 'assignments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attachments_child_id_fkey'
            columns: ['child_id']
            isOneToOne: false
            referencedRelation: 'children'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attachments_lesson_id_fkey'
            columns: ['lesson_id']
            isOneToOne: false
            referencedRelation: 'lessons'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attachments_message_id_fkey'
            columns: ['message_id']
            isOneToOne: false
            referencedRelation: 'messages'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attachments_uploaded_by_fkey'
            columns: ['uploaded_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }

      /* ------------------------------------------------------------------ */
      grades: {
        Row: {
          id: string
          child_id: string
          subject_id: string | null
          date: string
          value: number
          max_value: number
          source: GradeSource
          note: string | null
          attachment_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          child_id: string
          subject_id?: string | null
          date?: string
          value: number
          max_value?: number
          source?: GradeSource
          note?: string | null
          attachment_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          child_id?: string
          subject_id?: string | null
          date?: string
          value?: number
          max_value?: number
          source?: GradeSource
          note?: string | null
          attachment_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'grades_attachment_id_fkey'
            columns: ['attachment_id']
            isOneToOne: false
            referencedRelation: 'attachments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'grades_child_id_fkey'
            columns: ['child_id']
            isOneToOne: false
            referencedRelation: 'children'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'grades_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'subjects'
            referencedColumns: ['id']
          },
        ]
      }

      /* ------------------------------------------------------------------ */
      topic_mastery: {
        Row: {
          id: string
          child_id: string
          topic_id: string
          /** 0..100 */
          level: number
          samples: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          child_id: string
          topic_id: string
          level?: number
          samples?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          child_id?: string
          topic_id?: string
          level?: number
          samples?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'topic_mastery_child_id_fkey'
            columns: ['child_id']
            isOneToOne: false
            referencedRelation: 'children'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'topic_mastery_topic_id_fkey'
            columns: ['topic_id']
            isOneToOne: false
            referencedRelation: 'topics'
            referencedColumns: ['id']
          },
        ]
      }

      /* ------------------------------------------------------------------ */
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          payload: Json
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          payload?: Json
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: string
          payload?: Json
          read_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }

    Views: {
      [_ in never]: never
    }

    Functions: {
      current_family_id: {
        Args: Record<PropertyKey, never>
        Returns: string | null
      }
      is_parent: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_helper: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_child: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      my_child_id: {
        Args: Record<PropertyKey, never>
        Returns: string | null
      }
      my_family_child_ids: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
      my_family_user_ids: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
      child_in_my_family: {
        Args: { p_child_id: string }
        Returns: boolean
      }
      child_stats_visible: {
        Args: { p_child_id: string }
        Returns: boolean
      }
      can_review: {
        Args: { p_child_id: string }
        Returns: boolean
      }
      assignment_child_id: {
        Args: { p_assignment_id: string }
        Returns: string | null
      }
      lesson_child_id: {
        Args: { p_lesson_id: string }
        Returns: string | null
      }
      message_child_id: {
        Args: { p_message_id: string }
        Returns: string | null
      }
      subject_child_id: {
        Args: { p_subject_id: string }
        Returns: string | null
      }
      topic_child_id: {
        Args: { p_topic_id: string }
        Returns: string | null
      }
      storage_child_id: {
        Args: { p_name: string }
        Returns: string | null
      }
      storage_assignment_id: {
        Args: { p_name: string }
        Returns: string | null
      }
    }

    /**
     * No real Postgres enum types exist in this schema — the unions below are
     * enforced by CHECK constraints. Re-exported here so `Database['public']
     * ['Enums']['assignment_status']` reads the way generated code usually does.
     */
    Enums: {
      user_role: UserRole
      assignment_status: AssignmentStatus
      attachment_kind: AttachmentKind
      grade_source: GradeSource
      child_ui_mode: ChildUiMode
    }

    CompositeTypes: {
      [_ in never]: never
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Convenience aliases                                                         */
/* -------------------------------------------------------------------------- */

type PublicSchema = Database['public']
export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update']

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Family = Database['public']['Tables']['families']['Row']
export type FamilyMember = Database['public']['Tables']['family_members']['Row']
export type Child = Database['public']['Tables']['children']['Row']
export type Subject = Database['public']['Tables']['subjects']['Row']
export type ScheduleSlot = Database['public']['Tables']['schedule_slots']['Row']
export type Lesson = Database['public']['Tables']['lessons']['Row']
export type Topic = Database['public']['Tables']['topics']['Row']
export type Assignment = Database['public']['Tables']['assignments']['Row']
export type AssignmentEvent = Database['public']['Tables']['assignment_events']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
export type MessageRead = Database['public']['Tables']['message_reads']['Row']
export type Attachment = Database['public']['Tables']['attachments']['Row']
export type Grade = Database['public']['Tables']['grades']['Row']
export type TopicMastery = Database['public']['Tables']['topic_mastery']['Row']
export type Notification = Database['public']['Tables']['notifications']['Row']

export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
export type ChildInsert = Database['public']['Tables']['children']['Insert']
export type SubjectInsert = Database['public']['Tables']['subjects']['Insert']
export type ScheduleSlotInsert = Database['public']['Tables']['schedule_slots']['Insert']
export type LessonInsert = Database['public']['Tables']['lessons']['Insert']
export type TopicInsert = Database['public']['Tables']['topics']['Insert']
export type AssignmentInsert = Database['public']['Tables']['assignments']['Insert']
export type MessageInsert = Database['public']['Tables']['messages']['Insert']
export type AttachmentInsert = Database['public']['Tables']['attachments']['Insert']
export type GradeInsert = Database['public']['Tables']['grades']['Insert']

export type ChildUpdate = Database['public']['Tables']['children']['Update']
export type SubjectUpdate = Database['public']['Tables']['subjects']['Update']
export type ScheduleSlotUpdate = Database['public']['Tables']['schedule_slots']['Update']
export type LessonUpdate = Database['public']['Tables']['lessons']['Update']
export type AssignmentUpdate = Database['public']['Tables']['assignments']['Update']
