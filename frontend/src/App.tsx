import { Routes, Route, Navigate } from "react-router-dom";
import Home from "@/pages/Home";
import ApartmentPage from "@/pages/ApartmentPage";
import AreaClienti from "@/pages/AreaClienti";
import Admin from "@/pages/Admin";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/torre" element={<ApartmentPage key="torre" aptId="torre" />} />
      <Route path="/corte" element={<ApartmentPage key="corte" aptId="corte" />} />
      <Route path="/area-clienti" element={<AreaClienti />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
