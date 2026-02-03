'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Compass, FolderKanban, TrendingUp, Moon, LucideIcon } from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon | null
  isLogo?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Today', icon: null, isLogo: true },
  { href: '/path-finder', label: 'Path Finder', icon: Compass },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/progress', label: 'Progress', icon: TrendingUp },
  { href: '/evening', label: 'Evening', icon: Moon },
]

export function BottomNavigation() {
  const pathname = usePathname()

  return (
    <nav className="bg-slate-900/90 backdrop-blur-lg border-t border-slate-800 safe-bottom">
      <div className="max-w-lg mx-auto px-2 py-3 flex items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-2 transition-colors ${
                isActive
                  ? 'text-teal-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.isLogo ? (
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  isActive ? 'bg-teal-500/20' : 'bg-slate-700'
                }`}>
                  <span className={`text-xs font-bold ${
                    isActive ? 'text-teal-400' : 'text-slate-300'
                  }`}>R</span>
                </div>
              ) : item.icon ? (
                <item.icon className="w-6 h-6" />
              ) : null}
              <span className="text-xs">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
