interface CardProps {
  children: React.ReactNode
  className?: string
}

export default function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-[#111111] rounded-[12px] border border-[#2a2a2a] ${className}`}>
      {children}
    </div>
  )
}
