'use client'

import { Slider } from '@/components/ui/Slider'

interface MoodSliderProps {
  energy: number
  mood: number
  onEnergyChange: (value: number) => void
  onMoodChange: (value: number) => void
  className?: string
}

const getEnergyEmoji = (value: number): string => {
  if (value <= 2) return '😴'
  if (value <= 4) return '😐'
  if (value <= 6) return '🙂'
  if (value <= 8) return '😊'
  return '⚡'
}

const getMoodEmoji = (value: number): string => {
  if (value <= 2) return '😢'
  if (value <= 4) return '😔'
  if (value <= 6) return '😐'
  if (value <= 8) return '🙂'
  return '😄'
}

export function MoodSlider({
  energy,
  mood,
  onEnergyChange,
  onMoodChange,
  className = '',
}: MoodSliderProps) {
  return (
    <div className={`space-y-8 ${className}`}>
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{getEnergyEmoji(energy)}</span>
          <span className="text-slate-300 font-medium">Energy level</span>
        </div>
        <Slider
          value={energy}
          onChange={onEnergyChange}
          min={1}
          max={10}
          leftLabel="Exhausted"
          rightLabel="Energized"
        />
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{getMoodEmoji(mood)}</span>
          <span className="text-slate-300 font-medium">Mood</span>
        </div>
        <Slider
          value={mood}
          onChange={onMoodChange}
          min={1}
          max={10}
          leftLabel="Low"
          rightLabel="Great"
        />
      </div>
    </div>
  )
}
