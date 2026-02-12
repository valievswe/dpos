import React from 'react'
type NavbarProps = {
  title: string
}

const Navbar: React.FC<NavbarProps> = ({ title }) => {
  return (
    <nav style={{ padding: '12px', borderBottom: '1px solid #ccc' }}>
      <span>{title}</span>
      <ul style={{ listStyle: 'none', display: 'inline-flex', gap: '12px', marginLeft: '20px' }}>
        <li>Home</li>
        <li>About</li>
        <li>Contact</li>
      </ul>
    </nav>
  )
}

export default Navbar
