import qr from '../whatsapp-qr.png';

export default function PromoWhatsApp() {
  return (
    <a
      href="https://whatsapp.com/channel/0029Vb6X0z9I7Be6gEMnKC14"
      target="_blank"
      rel="noopener noreferrer"
      className="mt-8 flex items-center gap-4 rounded-2xl border border-palm/20 bg-palm/5 p-4 transition hover:border-palm/40 hover:bg-palm/10"
    >
      <img src={qr} alt="Código QR del canal de WhatsApp del SFL" className="h-20 w-20 rounded-lg border border-palm/20 bg-white p-1" />
      <div>
        <p className="font-semibold text-palm">📲 Síguenos en nuestro canal de WhatsApp</p>
        <p className="text-sm text-ink/60">Entérate de fechas, avisos y novedades del SFL. Escanea el código o toca aquí.</p>
      </div>
    </a>
  );
}
