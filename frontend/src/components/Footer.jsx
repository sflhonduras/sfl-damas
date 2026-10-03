export default function Footer() {
  return (
    <footer className="border-t border-ink/10 bg-parchment-2 py-8 text-center text-sm text-ink/60">
      <p>Fraternidad Internacional de Hombres de Negocios del Evangelio Completo — FIHNEC</p>
      <p className="mt-1">Seminario para la Formación de Líderes · Honduras</p>
      <p className="mt-3 text-xs text-ink/40">© {new Date().getFullYear()} SFL FIHNEC Honduras. Todos los derechos reservados.</p>
    </footer>
  );
}
