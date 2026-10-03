import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import RegistroEvento1 from './pages/RegistroEvento1';
import InformeCierreNivel from './pages/InformeCierreNivel';
import RegistroEnVivo from './pages/RegistroEnVivo';
import EsperaServidor from './components/EsperaServidor';
import RegistroEventoN from './pages/RegistroEventoN';
import Autoconsulta from './pages/Autoconsulta';
import PortalServidor from './pages/PortalServidor';
import AdminLogin from './pages/AdminLogin';
import AdminLayout from './pages/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminParticipantes from './pages/AdminParticipantes';
import AdminDiplomas from './pages/AdminDiplomas';
import AdminDiplomasSinRequisitos from './pages/AdminDiplomasSinRequisitos';
import AdminReportes from './pages/AdminReportes';
import AdminMedallas from './pages/AdminMedallas';
import AdminServidores from './pages/AdminServidores';
import AdminEventos from './pages/AdminEventos';
import AdminInventario from './pages/AdminInventario';
import AdminTransporte from './pages/AdminTransporte';
import AdminAuditoria from './pages/AdminAuditoria';
import AdminUsuarios from './pages/AdminUsuarios';
import AdminMantenimiento from './pages/AdminMantenimiento';
import CocinaDashboard from './pages/CocinaDashboard';

function PublicShell({ children }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicShell><Home /></PublicShell>} />
        <Route path="/registro/1" element={<PublicShell><EsperaServidor tema="claro" mensaje="para tu inscripción"><RegistroEvento1 /></EsperaServidor></PublicShell>} />
        <Route path="/registro/:orden" element={<PublicShell><EsperaServidor tema="claro" mensaje="para tu inscripción"><RegistroEventoN /></EsperaServidor></PublicShell>} />
        <Route path="/autoconsulta" element={<PublicShell><Autoconsulta /></PublicShell>} />
        <Route path="/servidores/portal" element={<PublicShell><PortalServidor /></PublicShell>} />
        <Route path="/informe/:token" element={<InformeCierreNivel />} />
        <Route path="/en-vivo/:token" element={<RegistroEnVivo />} />

        <Route path="/admin">
          <Route index element={<PublicShell><EsperaServidor tema="oscuro" mensaje="para tu sesión"><AdminLogin /></EsperaServidor></PublicShell>} />
          <Route path="cocina" element={<ProtectedRoute><CocinaDashboard /></ProtectedRoute>} />
          <Route element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
            <Route path="panel" element={<AdminDashboard />} />
            <Route path="participantes" element={<AdminParticipantes />} />
            <Route path="diplomas" element={<AdminDiplomas />} />
            <Route path="diplomas/sin-requisitos" element={<AdminDiplomasSinRequisitos />} />
            <Route path="reportes" element={<AdminReportes />} />
            <Route path="medallas" element={<AdminMedallas />} />
            <Route path="servidores" element={<AdminServidores />} />
            <Route path="eventos" element={<AdminEventos />} />
            <Route path="inventario" element={<AdminInventario />} />
            <Route path="transporte" element={<AdminTransporte />} />
            <Route path="usuarios" element={<ProtectedRoute rolRequerido="super_admin"><AdminUsuarios /></ProtectedRoute>} />
            <Route path="auditoria" element={<ProtectedRoute rolRequerido="super_admin"><AdminAuditoria /></ProtectedRoute>} />
            <Route path="mantenimiento" element={<ProtectedRoute rolRequerido="super_admin"><AdminMantenimiento /></ProtectedRoute>} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
