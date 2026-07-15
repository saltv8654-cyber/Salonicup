export type Role       = 'admin' | 'speaker' | 'captain' | 'viewer'
export type MatchState = 'Scheduled' | 'Live' | 'Played' | 'Postponed' | 'Forfeit'
export type Period     = 'H1' | 'H2' | 'ET' | 'PEN'
export type EventType  =
  | 'GOAL' | 'OWN' | 'ASSIST' | 'YELLOW' | 'RED'
  | 'PEN_SCORED' | 'PEN_MISSED'

export interface Profile {
  id: string; email: string | null; full_name: string | null
  role: Role; team_id: string | null
}

export interface League {
  league_id: string; name: string; season: string
  logo_url: string | null; sort_order: number; active: boolean
}

export interface Venue {
  venue_id: string; name: string; fields: string[]
}

export interface Team {
  team_id: string; league_id: string; name: string
  logo_url: string | null; postponements: number; active: boolean
}

export interface Player {
  player_id: string; team_id: string; full_name: string
  number: number | null; photo_url: string | null; active: boolean
}

export interface Match {
  match_id: string; league_id: string; round: number
  match_date: string | null; venue_id: string | null; field: string | null
  team_a: string; team_b: string
  goals_team_a: number; goals_team_b: number
  pens_team_a: number; pens_team_b: number
  match_status: MatchState
  report: string | null
  squad_a: string[]; squad_b: string[]
  squad_set_at: string | null; squad_set_by: string | null
}

export interface MatchEvent {
  event_id: string; match_id: string; team_id: string; player_id: string
  event_type: EventType; period: Period; minute: number | null
  created_at: string; created_by: string | null
  edited_at: string | null; edited_by: string | null
}

export interface Standing {
  team_id: string; league_id: string; team_name: string
  logo_url: string | null; postponements: number
  played: number; wins: number; draws: number; losses: number
  goals_for: number; goals_against: number; goal_diff: number
  points: number; position: number
}

export interface PlayerStat {
  player_id: string; team_id: string; league_id: string
  full_name: string; number: number | null; photo_url: string | null
  team_name: string; appearances: number
  goals: number; own_goals: number; assists: number
  yellow_cards: number; red_cards: number
}

export interface Slot {
  slot_id: string; venue_id: string; field: string
  starts_at: string; match_id: string | null
}
