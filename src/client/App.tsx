import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { SessionProvider } from './components/SessionProvider'
import { ToastProvider } from './components/Toast'
import { AccountsPage } from './pages/AccountsPage'
import { ApprovalQueuePage } from './pages/ApprovalQueuePage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { ContentStudioPage } from './pages/ContentStudioPage'
import { DashboardPage } from './pages/DashboardPage'
import { PublishAssistPage } from './pages/PublishAssistPage'
import { OperationsPage } from './pages/OperationsPage'
import { RevenuePage } from './pages/RevenuePage'
import { ResearchPage } from './pages/ResearchPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/accounts" element={<AccountsPage />} />
              <Route path="/research" element={<ResearchPage />} />
              <Route path="/drafts" element={<ContentStudioPage />} />
              <Route path="/approvals" element={<ApprovalQueuePage />} />
              <Route path="/calendar" element={<PublishAssistPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/operations" element={<OperationsPage />} />
              <Route path="/revenue" element={<RevenuePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SessionProvider>
    </ToastProvider>
  )
}
