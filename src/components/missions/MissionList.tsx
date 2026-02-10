'use client'

import { motion } from 'framer-motion'
import { Plus, Target } from 'lucide-react'
import { MissionCard } from './MissionCard'
import { Button } from '@/components/ui/Button'
import type { DailyMission } from '@/lib/supabase/types'

interface MissionListProps {
  missions: DailyMission[]
  onComplete: (id: string) => Promise<void>
  onSkip: (id: string) => void
  onAdd?: () => void
  showAddButton?: boolean
}

export function MissionList({
  missions,
  onComplete,
  onSkip,
  onAdd,
  showAddButton = false,
}: MissionListProps) {
  if (missions.length === 0) {
    return (
      <div className="text-center py-8">
        <Target className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400 text-sm mb-4">No missions for today</p>
        {showAddButton && onAdd && (
          <Button variant="secondary" size="sm" onClick={onAdd}>
            <Plus className="w-4 h-4 mr-1" />
            Create Mission
          </Button>
        )}
      </div>
    )
  }

  // Separate primary and other missions
  const primaryMission = missions.find(m => m.status === 'pending' || m.status === 'in_progress')
  const otherMissions = missions.filter(m => m.id !== primaryMission?.id)

  return (
    <div className="space-y-4">
      {/* Primary Mission */}
      {primaryMission && (
        <MissionCard
          mission={primaryMission}
          isPrimary
          onComplete={() => onComplete(primaryMission.id)}
          onSkip={() => onSkip(primaryMission.id)}
        />
      )}

      {/* Other Missions */}
      {otherMissions.length > 0 && (
        <div className="space-y-2">
          {primaryMission && (
            <h4 className="text-xs text-slate-500 uppercase tracking-wide">Also Today</h4>
          )}
          {otherMissions.map((mission, index) => (
            <motion.div
              key={mission.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <MissionCard
                mission={mission}
                onComplete={() => onComplete(mission.id)}
                onSkip={() => onSkip(mission.id)}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Add Button */}
      {showAddButton && onAdd && (
        <Button variant="ghost" size="sm" onClick={onAdd} className="w-full">
          <Plus className="w-4 h-4 mr-1" />
          Add Custom Mission
        </Button>
      )}
    </div>
  )
}
