// Campo de texto con sugerencias buscables (usa <datalist>, así permite escribir
// libremente si la opción no aparece en la lista, pero facilita elegir de una lista conocida).
export default function CampoBuscable({ id, opciones, value, onChange, placeholder, required }) {
  return (
    <>
      <input
        list={`lista-${id}`}
        required={required}
        autoComplete="off"
        className="w-full rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-ink outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
      <datalist id={`lista-${id}`}>
        {opciones.map(op => <option key={op} value={op} />)}
      </datalist>
    </>
  );
}
