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
    <div className="absolute bottom-20 left-4 flex flex-wrap gap-x-3 gap-y-1.5 max-w-[200px]">
      {categories.map((cat) => (
        <div key={cat} className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: CATEGORY_COLORS[cat] }}
          />
          <span className="text-[10px] text-slate-500">
            {CATEGORY_LABELS[cat]}
          </span>
        </div>
      ))}
    </div>
  )
}
