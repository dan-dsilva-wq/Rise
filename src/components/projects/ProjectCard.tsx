'use client'

import { motion } from 'framer-motion'
import { ChevronRight, Rocket, Target, Hammer, CheckCircle, PauseCircle } from 'lucide-react'
import Link from 'next/link'
import type { Project } from '@/lib/supabase/types'

interface ProjectCardProps {
  project: Project
  delay?: number
}

const statusConfig = {
  discovery: {
    label: 'Discovery',
    icon: Target,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
  },
  planning: {
    label: 'Planning',
    icon: Target,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  building: {
    label: 'Building',
    icon: Hammer,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
  },
  launched: {
    label: 'Launched',
    icon: Rocket,
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/10',
    borderColor: 'border-teal-500/30',
  },
  paused: {
    label: 'Paused',
    icon: PauseCircle,
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10',
    borderColor: 'border-slate-500/30',
  },
}

export function ProjectCard({ project, delay = 0 }: ProjectCardProps) {
  const status = statusConfig[project.status]
  const StatusIcon = status.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Link href={`/projects/${project.id}`}>
        <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/50 hover:border-slate-600/50 transition-all group">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-white group-hover:text-teal-400 transition-colors truncate">
                {project.name}
              </h3>
              {project.description && (
                <p className="text-sm text-slate-400 line-clamp-2 mt-1">
                  {project.description}
                </p>
              )}
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-teal-400 transition-colors flex-shrink-0 ml-2" />
          </div>

          {/* Progress Bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-400">Progress</span>
              <span className="text-slate-300 font-medium">{project.progress_percent}%</span>
            </div>
            <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${project.progress_percent}%` }}
                transition={{ duration: 0.5, delay: delay + 0.2 }}
                className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full"
              />
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex items-center justify-between">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.bgColor} ${status.borderColor} border ${status.color}`}>
              <StatusIcon className="w-3.5 h-3.5" />
              {status.label}
            </div>

            {project.status === 'launched' && project.actual_income > 0 && (
              <div className="text-sm text-teal-400 font-medium">
                ${(project.actual_income / 100).toFixed(0)}/mo
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
