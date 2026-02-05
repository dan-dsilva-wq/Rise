'use client'

import { motion } from 'framer-motion'
import { ChevronRight, Rocket, Target, Hammer, PauseCircle } from 'lucide-react'
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
    >
      <Link
        href={`/projects/${project.id}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 rounded-3xl"
      >
        <motion.div
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 hover:border-teal-500/50 transition-all duration-300 group shadow-lg hover:shadow-teal-500/10"
          whileHover={{ y: -4, scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          {/* Subtle glow effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          <div className="relative p-6">
            {/* Status indicator bar at top */}
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${
              project.status === 'discovery' ? 'from-purple-500 to-purple-400' :
              project.status === 'planning' ? 'from-blue-500 to-blue-400' :
              project.status === 'building' ? 'from-amber-500 to-amber-400' :
              project.status === 'launched' ? 'from-teal-500 to-emerald-400' :
              'from-slate-500 to-slate-400'
            }`} />

            {/* Header */}
            <div className="flex items-start justify-between mb-5 pt-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-2xl text-white group-hover:text-teal-400 transition-colors mb-2">
                  {project.name}
                </h3>
                <p className="text-base text-slate-400 line-clamp-2 leading-relaxed">
                  {project.description || 'Your next big thing awaits...'}
                </p>
              </div>
              <div className="ml-4 p-2 rounded-full bg-slate-700/50 group-hover:bg-teal-500/20 transition-colors">
                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-teal-400 group-hover:translate-x-0.5 transition-all duration-200" />
              </div>
            </div>

            {/* Progress Section */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-slate-300">Progress</span>
                <span className="text-lg font-bold text-white">{project.progress_percent}%</span>
              </div>
              <div className="h-4 bg-slate-700/50 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${project.progress_percent}%` }}
                  transition={{ duration: 0.8, delay: delay + 0.2, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-teal-500 via-teal-400 to-emerald-400 rounded-full shadow-lg shadow-teal-500/30"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2">
              <div className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ${status.bgColor} ${status.borderColor} border ${status.color} group-hover:scale-105 transition-transform duration-200`}>
                <StatusIcon className="w-4 h-4" />
                {status.label}
              </div>

              {project.status === 'launched' && project.actual_income > 0 ? (
                <div className="text-lg font-bold text-teal-400">
                  ${(project.actual_income / 100).toFixed(0)}/mo
                </div>
              ) : (
                <span className="text-sm text-slate-500 group-hover:text-slate-400 transition-colors">Tap to continue →</span>
              )}
            </div>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  )
}
