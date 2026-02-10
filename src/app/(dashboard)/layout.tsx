import { FeedbackButton } from '@/components/feedback/FeedbackButton'

export const dynamic = 'force-dynamic'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {children}
      <FeedbackButton />
    </>
  )
}
