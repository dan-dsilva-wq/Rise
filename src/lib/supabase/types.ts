export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          timezone: string
          total_xp: number
          current_level: number
          current_streak: number
          longest_streak: number
          unlock_tier: number
          grace_days_used_this_week: number
          week_start_date: string
          partner_sharing_enabled: boolean
          partner_email: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          timezone?: string
          total_xp?: number
          current_level?: number
          current_streak?: number
          longest_streak?: number
          unlock_tier?: number
          grace_days_used_this_week?: number
          week_start_date?: string
          partner_sharing_enabled?: boolean
          partner_email?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          timezone?: string
          total_xp?: number
          current_level?: number
          current_streak?: number
          longest_streak?: number
          unlock_tier?: number
          grace_days_used_this_week?: number
          week_start_date?: string
          partner_sharing_enabled?: boolean
          partner_email?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      daily_logs: {
        Row: {
          id: string
          user_id: string
          log_date: string
          wake_time: string | null
          im_up_pressed_at: string | null
          time_to_rise_minutes: number | null
          morning_energy: number | null
          morning_mood: number | null
          feet_on_floor: boolean
          light_exposure: boolean
          drank_water: boolean
          evening_energy: number | null
          evening_mood: number | null
          day_rating: number | null
          movement_minutes: number
          went_outside: boolean
          gratitude_entry: string | null
          reflection_notes: string | null
          xp_earned: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          log_date: string
          wake_time?: string | null
          im_up_pressed_at?: string | null
          time_to_rise_minutes?: number | null
          morning_energy?: number | null
          morning_mood?: number | null
          feet_on_floor?: boolean
          light_exposure?: boolean
          drank_water?: boolean
          evening_energy?: number | null
          evening_mood?: number | null
          day_rating?: number | null
          movement_minutes?: number
          went_outside?: boolean
          gratitude_entry?: string | null
          reflection_notes?: string | null
          xp_earned?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          log_date?: string
          wake_time?: string | null
          im_up_pressed_at?: string | null
          time_to_rise_minutes?: number | null
          morning_energy?: number | null
          morning_mood?: number | null
          feet_on_floor?: boolean
          light_exposure?: boolean
          drank_water?: boolean
          evening_energy?: number | null
          evening_mood?: number | null
          day_rating?: number | null
          movement_minutes?: number
          went_outside?: boolean
          gratitude_entry?: string | null
          reflection_notes?: string | null
          xp_earned?: number
          created_at?: string
          updated_at?: string
        }
      }
      habits: {
        Row: {
          id: string
          user_id: string
          name: string
          emoji: string
          description: string | null
          frequency: string
          frequency_days: number[]
          anchor_habit_id: string | null
          anchor_position: 'before' | 'after' | null
          current_streak: number
          longest_streak: number
          xp_value: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          emoji?: string
          description?: string | null
          frequency?: string
          frequency_days?: number[]
          anchor_habit_id?: string | null
          anchor_position?: 'before' | 'after' | null
          current_streak?: number
          longest_streak?: number
          xp_value?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          emoji?: string
          description?: string | null
          frequency?: string
          frequency_days?: number[]
          anchor_habit_id?: string | null
          anchor_position?: 'before' | 'after' | null
          current_streak?: number
          longest_streak?: number
          xp_value?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      habit_completions: {
        Row: {
          id: string
          habit_id: string
          user_id: string
          completion_date: string
          xp_earned: number
          completed_at: string
        }
        Insert: {
          id?: string
          habit_id: string
          user_id: string
          completion_date: string
          xp_earned?: number
          completed_at?: string
        }
        Update: {
          id?: string
          habit_id?: string
          user_id?: string
          completion_date?: string
          xp_earned?: number
          completed_at?: string
        }
      }
      achievements: {
        Row: {
          id: string
          code: string
          name: string
          description: string | null
          emoji: string
          unlock_condition: Json
          xp_reward: number
          display_order: number
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          name: string
          description?: string | null
          emoji?: string
          unlock_condition: Json
          xp_reward?: number
          display_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          code?: string
          name?: string
          description?: string | null
          emoji?: string
          unlock_condition?: Json
          xp_reward?: number
          display_order?: number
          created_at?: string
        }
      }
      user_achievements: {
        Row: {
          id: string
          user_id: string
          achievement_id: string
          unlocked_at: string
        }
        Insert: {
          id?: string
          user_id: string
          achievement_id: string
          unlocked_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          achievement_id?: string
          unlocked_at?: string
        }
      }
      daily_prompts: {
        Row: {
          id: string
          prompt_text: string
          author: string | null
          category: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          prompt_text: string
          author?: string | null
          category?: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          prompt_text?: string
          author?: string | null
          category?: string
          is_active?: boolean
          created_at?: string
        }
      }
      // Rise 2.0 Tables
      path_finder_progress: {
        Row: {
          id: string
          user_id: string
          current_node_id: string
          visited_nodes: string[]
          selected_path: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          current_node_id?: string
          visited_nodes?: string[]
          selected_path?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          current_node_id?: string
          visited_nodes?: string[]
          selected_path?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          status: 'discovery' | 'planning' | 'building' | 'launched' | 'paused'
          path_node_id: string | null
          target_income: number
          actual_income: number
          progress_percent: number
          started_at: string
          launched_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          status?: 'discovery' | 'planning' | 'building' | 'launched' | 'paused'
          path_node_id?: string | null
          target_income?: number
          actual_income?: number
          progress_percent?: number
          started_at?: string
          launched_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          status?: 'discovery' | 'planning' | 'building' | 'launched' | 'paused'
          path_node_id?: string | null
          target_income?: number
          actual_income?: number
          progress_percent?: number
          started_at?: string
          launched_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      milestones: {
        Row: {
          id: string
          project_id: string
          user_id: string
          title: string
          description: string | null
          notes: string | null
          sort_order: number
          status: 'pending' | 'in_progress' | 'completed' | 'discarded' | 'idea'
          focus_level: 'active' | 'next' | 'backlog'
          due_date: string | null
          xp_reward: number
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          user_id: string
          title: string
          description?: string | null
          notes?: string | null
          sort_order?: number
          status?: 'pending' | 'in_progress' | 'completed' | 'discarded' | 'idea'
          focus_level?: 'active' | 'next' | 'backlog'
          due_date?: string | null
          xp_reward?: number
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          user_id?: string
          title?: string
          description?: string | null
          notes?: string | null
          sort_order?: number
          status?: 'pending' | 'in_progress' | 'completed' | 'discarded' | 'idea'
          focus_level?: 'active' | 'next' | 'backlog'
          due_date?: string | null
          xp_reward?: number
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      daily_missions: {
        Row: {
          id: string
          user_id: string
          project_id: string | null
          milestone_id: string | null
          title: string
          description: string | null
          mission_date: string
          status: 'pending' | 'in_progress' | 'completed' | 'skipped'
          xp_reward: number
          priority: number
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          project_id?: string | null
          milestone_id?: string | null
          title: string
          description?: string | null
          mission_date: string
          status?: 'pending' | 'in_progress' | 'completed' | 'skipped'
          xp_reward?: number
          priority?: number
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          project_id?: string | null
          milestone_id?: string | null
          title?: string
          description?: string | null
          mission_date?: string
          status?: 'pending' | 'in_progress' | 'completed' | 'skipped'
          xp_reward?: number
          priority?: number
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      project_logs: {
        Row: {
          id: string
          project_id: string
          user_id: string
          role: 'user' | 'assistant' | 'system'
          content: string
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          user_id: string
          role: 'user' | 'assistant' | 'system'
          content: string
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          user_id?: string
          role?: 'user' | 'assistant' | 'system'
          content?: string
          metadata?: Json
          created_at?: string
        }
      }
      user_profile_facts: {
        Row: {
          id: string
          user_id: string
          category: 'background' | 'skills' | 'situation' | 'goals' | 'preferences' | 'constraints'
          fact: string
          created_at: string
          updated_at: string
          is_active: boolean
        }
        Insert: {
          id?: string
          user_id: string
          category: 'background' | 'skills' | 'situation' | 'goals' | 'preferences' | 'constraints'
          fact: string
          created_at?: string
          updated_at?: string
          is_active?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          category?: 'background' | 'skills' | 'situation' | 'goals' | 'preferences' | 'constraints'
          fact?: string
          created_at?: string
          updated_at?: string
          is_active?: boolean
        }
      }
      path_finder_conversations: {
        Row: {
          id: string
          user_id: string
          title: string | null
          created_at: string
          updated_at: string
          is_active: boolean
        }
        Insert: {
          id?: string
          user_id: string
          title?: string | null
          created_at?: string
          updated_at?: string
          is_active?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          title?: string | null
          created_at?: string
          updated_at?: string
          is_active?: boolean
        }
      }
      path_finder_messages: {
        Row: {
          id: string
          conversation_id: string
          user_id: string
          role: 'user' | 'assistant'
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          user_id: string
          role: 'user' | 'assistant'
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          user_id?: string
          role?: 'user' | 'assistant'
          content?: string
          created_at?: string
        }
      }
      // Milestone Mode tables
      milestone_conversations: {
        Row: {
          id: string
          milestone_id: string
          user_id: string
          is_active: boolean
          approach: 'do-it' | 'guide' | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          milestone_id: string
          user_id: string
          is_active?: boolean
          approach?: 'do-it' | 'guide' | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          milestone_id?: string
          user_id?: string
          is_active?: boolean
          approach?: 'do-it' | 'guide' | null
          created_at?: string
          updated_at?: string
        }
      }
      milestone_steps: {
        Row: {
          id: string
          milestone_id: string
          user_id: string
          text: string
          step_type: 'action' | 'decision' | 'research'
          sort_order: number
          is_completed: boolean
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          milestone_id: string
          user_id: string
          text: string
          step_type?: 'action' | 'decision' | 'research'
          sort_order?: number
          is_completed?: boolean
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          milestone_id?: string
          user_id?: string
          text?: string
          step_type?: 'action' | 'decision' | 'research'
          sort_order?: number
          is_completed?: boolean
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      milestone_messages: {
        Row: {
          id: string
          conversation_id: string
          user_id: string
          role: 'user' | 'assistant'
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          user_id: string
          role: 'user' | 'assistant'
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          user_id?: string
          role?: 'user' | 'assistant'
          content?: string
          created_at?: string
        }
      }
      // Morning Briefings
      morning_briefings: {
        Row: {
          id: string
          user_id: string
          briefing_date: string
          mission_summary: string
          nudge: string
          focus_project_id: string | null
          focus_milestone_id: string | null
          generated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          briefing_date: string
          mission_summary: string
          nudge: string
          focus_project_id?: string | null
          focus_milestone_id?: string | null
          generated_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          briefing_date?: string
          mission_summary?: string
          nudge?: string
          focus_project_id?: string | null
          focus_milestone_id?: string | null
          generated_at?: string
          created_at?: string
        }
      }
      // AI Context Bank tables
      project_context: {
        Row: {
          id: string
          project_id: string
          user_id: string
          context_type: 'tech_stack' | 'target_audience' | 'constraints' | 'decisions' | 'requirements'
          key: string
          value: string
          confidence: number
          source: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          user_id: string
          context_type: 'tech_stack' | 'target_audience' | 'constraints' | 'decisions' | 'requirements'
          key: string
          value: string
          confidence?: number
          source?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          user_id?: string
          context_type?: 'tech_stack' | 'target_audience' | 'constraints' | 'decisions' | 'requirements'
          key?: string
          value?: string
          confidence?: number
          source?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      ai_insights: {
        Row: {
          id: string
          user_id: string
          project_id: string | null
          milestone_id: string | null
          insight_type: 'discovery' | 'decision' | 'blocker' | 'preference' | 'learning'
          content: string
          importance: number
          fills_gap: string | null
          source_conversation_id: string | null
          source_ai: 'path_finder' | 'milestone_mode' | 'project_chat' | 'evening_reflection' | 'morning_checkin' | 'intelligence_layer'
          created_at: string
          expires_at: string | null
          is_active: boolean
        }
        Insert: {
          id?: string
          user_id: string
          project_id?: string | null
          milestone_id?: string | null
          insight_type: 'discovery' | 'decision' | 'blocker' | 'preference' | 'learning'
          content: string
          importance?: number
          fills_gap?: string | null
          source_conversation_id?: string | null
          source_ai: 'path_finder' | 'milestone_mode' | 'project_chat' | 'evening_reflection' | 'morning_checkin' | 'intelligence_layer'
          created_at?: string
          expires_at?: string | null
          is_active?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          project_id?: string | null
          milestone_id?: string | null
          insight_type?: 'discovery' | 'decision' | 'blocker' | 'preference' | 'learning'
          content?: string
          importance?: number
          fills_gap?: string | null
          source_conversation_id?: string | null
          source_ai?: 'path_finder' | 'milestone_mode' | 'project_chat' | 'evening_reflection' | 'morning_checkin' | 'intelligence_layer'
          created_at?: string
          expires_at?: string | null
          is_active?: boolean
        }
      }
      conversation_summaries: {
        Row: {
          id: string
          user_id: string
          conversation_key: string
          source_hash: string
          source_message_count: number
          summary: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          conversation_key: string
          source_hash: string
          source_message_count?: number
          summary: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          conversation_key?: string
          source_hash?: string
          source_message_count?: number
          summary?: string
          created_at?: string
          updated_at?: string
        }
      }
      user_understanding: {
        Row: {
          id: string
          user_id: string
          background: Json
          current_situation: Json
          values: string[]
          motivations: string[]
          definition_of_success: string | null
          strengths: string[]
          blockers: string[]
          work_style: Json
          unknown_questions: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          background?: Json
          current_situation?: Json
          values?: string[]
          motivations?: string[]
          definition_of_success?: string | null
          strengths?: string[]
          blockers?: string[]
          work_style?: Json
          unknown_questions?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          background?: Json
          current_situation?: Json
          values?: string[]
          motivations?: string[]
          definition_of_success?: string | null
          strengths?: string[]
          blockers?: string[]
          work_style?: Json
          unknown_questions?: string[]
          created_at?: string
          updated_at?: string
        }
      }
      patterns: {
        Row: {
          id: string
          user_id: string
          pattern_type: string
          description: string
          evidence: Json
          confidence: number
          first_detected: string
          last_confirmed: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          pattern_type: string
          description: string
          evidence?: Json
          confidence?: number
          first_detected?: string
          last_confirmed?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          pattern_type?: string
          description?: string
          evidence?: Json
          confidence?: number
          first_detected?: string
          last_confirmed?: string
          created_at?: string
          updated_at?: string
        }
      }
      proactive_questions: {
        Row: {
          id: string
          user_id: string
          gap_identified: string
          question: string
          sent_at: string | null
          opened_at: string | null
          answered_at: string | null
          answer: string | null
          insight_generated: string | null
          quality_score: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          gap_identified: string
          question: string
          sent_at?: string | null
          opened_at?: string | null
          answered_at?: string | null
          answer?: string | null
          insight_generated?: string | null
          quality_score?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          gap_identified?: string
          question?: string
          sent_at?: string | null
          opened_at?: string | null
          answered_at?: string | null
          answer?: string | null
          insight_generated?: string | null
          quality_score?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      feedback_requests: {
        Row: {
          id: string
          user_id: string
          summary: string
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          summary: string
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          summary?: string
          is_read?: boolean
          created_at?: string
        }
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          expiration_time: number | null
          user_agent: string | null
          is_active: boolean
          last_success_at: string | null
          last_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          expiration_time?: number | null
          user_agent?: string | null
          is_active?: boolean
          last_success_at?: string | null
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          expiration_time?: number | null
          user_agent?: string | null
          is_active?: boolean
          last_success_at?: string | null
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_xp: {
        Args: {
          user_id: string
          xp_amount: number
        }
        Returns: undefined
      }
      update_streak: {
        Args: {
          user_id: string
        }
        Returns: number
      }
      reset_weekly_grace_days: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      complete_mission: {
        Args: {
          mission_id: string
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Convenience types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type DailyLog = Database['public']['Tables']['daily_logs']['Row']
export type Habit = Database['public']['Tables']['habits']['Row']
export type HabitCompletion = Database['public']['Tables']['habit_completions']['Row']
export type Achievement = Database['public']['Tables']['achievements']['Row']
export type UserAchievement = Database['public']['Tables']['user_achievements']['Row']
export type DailyPrompt = Database['public']['Tables']['daily_prompts']['Row']

// Insert types
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
export type DailyLogInsert = Database['public']['Tables']['daily_logs']['Insert']
export type HabitInsert = Database['public']['Tables']['habits']['Insert']

// Update types
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
export type DailyLogUpdate = Database['public']['Tables']['daily_logs']['Update']

// Rise 2.0 Types
export type PathFinderProgress = Database['public']['Tables']['path_finder_progress']['Row']
export type Project = Database['public']['Tables']['projects']['Row']
export type Milestone = Database['public']['Tables']['milestones']['Row']
export type DailyMission = Database['public']['Tables']['daily_missions']['Row']
export type ProjectLog = Database['public']['Tables']['project_logs']['Row']

// Rise 2.0 Insert types
export type PathFinderProgressInsert = Database['public']['Tables']['path_finder_progress']['Insert']
export type ProjectInsert = Database['public']['Tables']['projects']['Insert']
export type MilestoneInsert = Database['public']['Tables']['milestones']['Insert']
export type DailyMissionInsert = Database['public']['Tables']['daily_missions']['Insert']
export type ProjectLogInsert = Database['public']['Tables']['project_logs']['Insert']

// Rise 2.0 Update types
export type ProjectUpdate = Database['public']['Tables']['projects']['Update']
export type MilestoneUpdate = Database['public']['Tables']['milestones']['Update']
export type DailyMissionUpdate = Database['public']['Tables']['daily_missions']['Update']

// User Profile Facts types
export type UserProfileFact = Database['public']['Tables']['user_profile_facts']['Row']
export type UserProfileFactInsert = Database['public']['Tables']['user_profile_facts']['Insert']
export type UserProfileFactUpdate = Database['public']['Tables']['user_profile_facts']['Update']
export type ProfileCategory = 'background' | 'skills' | 'situation' | 'goals' | 'preferences' | 'constraints'

// Path Finder Conversation types
export type PathFinderConversation = Database['public']['Tables']['path_finder_conversations']['Row']
export type PathFinderConversationInsert = Database['public']['Tables']['path_finder_conversations']['Insert']
export type PathFinderMessage = Database['public']['Tables']['path_finder_messages']['Row']
export type PathFinderMessageInsert = Database['public']['Tables']['path_finder_messages']['Insert']

// Milestone Mode types
export type MilestoneConversation = Database['public']['Tables']['milestone_conversations']['Row']
export type MilestoneConversationInsert = Database['public']['Tables']['milestone_conversations']['Insert']
export type MilestoneMessage = Database['public']['Tables']['milestone_messages']['Row']
export type MilestoneMessageInsert = Database['public']['Tables']['milestone_messages']['Insert']
export type MilestoneStep = Database['public']['Tables']['milestone_steps']['Row']
export type MilestoneStepInsert = Database['public']['Tables']['milestone_steps']['Insert']
export type MilestoneStepUpdate = Database['public']['Tables']['milestone_steps']['Update']

// Morning Briefing types
export type MorningBriefing = Database['public']['Tables']['morning_briefings']['Row']
export type MorningBriefingInsert = Database['public']['Tables']['morning_briefings']['Insert']

// AI Context Bank types
export type ProjectContext = Database['public']['Tables']['project_context']['Row']
export type ProjectContextInsert = Database['public']['Tables']['project_context']['Insert']
export type ProjectContextUpdate = Database['public']['Tables']['project_context']['Update']
export type ProjectContextType = 'tech_stack' | 'target_audience' | 'constraints' | 'decisions' | 'requirements'

export type AiInsight = Database['public']['Tables']['ai_insights']['Row']
export type AiInsightInsert = Database['public']['Tables']['ai_insights']['Insert']
export type AiInsightUpdate = Database['public']['Tables']['ai_insights']['Update']
export type InsightType = 'discovery' | 'decision' | 'blocker' | 'preference' | 'learning'
export type SourceAi = 'path_finder' | 'milestone_mode' | 'project_chat' | 'evening_reflection' | 'morning_checkin' | 'intelligence_layer'

// Intelligence layer types
export type ConversationSummary = Database['public']['Tables']['conversation_summaries']['Row']
export type ConversationSummaryInsert = Database['public']['Tables']['conversation_summaries']['Insert']
export type UserUnderstanding = Database['public']['Tables']['user_understanding']['Row']
export type UserUnderstandingInsert = Database['public']['Tables']['user_understanding']['Insert']
export type UserUnderstandingUpdate = Database['public']['Tables']['user_understanding']['Update']
export type BehaviorPattern = Database['public']['Tables']['patterns']['Row']
export type BehaviorPatternInsert = Database['public']['Tables']['patterns']['Insert']
export type BehaviorPatternUpdate = Database['public']['Tables']['patterns']['Update']
export type ProactiveQuestion = Database['public']['Tables']['proactive_questions']['Row']
export type ProactiveQuestionInsert = Database['public']['Tables']['proactive_questions']['Insert']
export type ProactiveQuestionUpdate = Database['public']['Tables']['proactive_questions']['Update']
export type PushSubscription = Database['public']['Tables']['push_subscriptions']['Row']
export type PushSubscriptionInsert = Database['public']['Tables']['push_subscriptions']['Insert']
export type PushSubscriptionUpdate = Database['public']['Tables']['push_subscriptions']['Update']

// Feedback types
export type FeedbackRequest = Database['public']['Tables']['feedback_requests']['Row']
export type FeedbackRequestInsert = Database['public']['Tables']['feedback_requests']['Insert']
