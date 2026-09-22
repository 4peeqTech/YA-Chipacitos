interface CardProps {
  children: React.ReactNode
  className?: string
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-surface rounded-card border border-border ${className}`}>
      {children}
    </div>
  )
}
