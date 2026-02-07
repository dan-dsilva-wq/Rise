'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Compass, FolderKanban, Settings, BarChart3, LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon | null
  isLogo?: boolean
}

// Home icon component
function HomeIcon({ isActive }: { isActive: boolean }) {
  return (
    <motion.div
      className={`w-6 h-6 rounded-full flex items-center justify-center ${
        isActive ? 'bg-orange-200 text-orange-700' : 'bg-[#efe3d1] text-[#6a5841]'
      }`}
      aria-hidden="true"
      animate={isActive ? { scale: [1, 1.1, 1] } : { scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <span className="text-xs font-bold">R</span>
    </motion.div>
  )
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Today', icon: null, isLogo: true },
  { href: '/path-finder', label: 'Discover', icon: Compass },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/progress', label: 'Progress', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function BottomNavigation() {
  const pathname = usePathname()

  return (
    <nav
      className="safe-bottom border-t border-[#dacdb9] bg-[#fff7ea]/92 backdrop-blur-lg"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="max-w-lg mx-auto px-2 py-3 flex items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className="relative"
            >
              <motion.div
                className={`flex flex-col items-center gap-0.5 px-1.5 py-1 ${
                  isActive
                    ? 'text-[#0f766e]'
                    : 'text-[#73624b]'
                }`}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              >
                {item.isLogo ? (
                  <HomeIcon isActive={isActive} />
                ) : Icon ? (
                  <motion.div
                    animate={isActive ? { y: [0, -2, 0] } : { y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </motion.div>
                ) : null}
                <span className="text-xs">{item.label}</span>

                {/* Animated underline indicator */}
                {isActive && (
                  <motion.div
                    className="absolute -bottom-1 left-1/2 h-0.5 rounded-full bg-[#0f766e]"
                    layoutId="nav-indicator"
                    initial={{ width: 0, x: '-50%' }}
                    animate={{ width: 16, x: '-50%' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
              </motion.div>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
