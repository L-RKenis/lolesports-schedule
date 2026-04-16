import { Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import { MatchDetailPage } from './pages/MatchDetailPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/match/:matchId" element={<MatchDetailPage />} />
    </Routes>
  )
}
