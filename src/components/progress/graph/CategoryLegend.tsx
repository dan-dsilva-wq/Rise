'use client'

import { GraphCategory } from './types'
import { CATEGORY_COLORS, CATEGORY_LABELS } from './constants'

interface CategoryLegendProps {
  activeCategories: Set<GraphCategory>
}

export function CategoryLegend({ activeCategories }: CategoryLegendProps) {
  if (activeCategories.size === 0) return null

  const categories = Array.from(activeCategories).sort()

  return (
    <div className="absolute bottom-20 left-4 z-[2] rounded-lg bg-slate-800/60 border border-slate-700/50 backdrop-blur-sm px-3 py-2.5 max-w-[200px]">
      <p className="text-[9px] font-mono font-medium uppercase tracking-widest text-slate-500 mb-2">
        Categories
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {categories.map((cat) => (
          <div key={cat} className="flex items-center gap-1.5">
            <span
              className="w-[6px] h-[6px] flex-shrink-0"
              style={{ backgroundColor: CATEGORY_COLORS[cat] }}
            />
            <span className="text-[10px] text-slate-500">
              {CATEGORY_LABELS[cat]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
