const VALORES = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
];

export function numeroARomano(numero) {
  if (!numero || numero <= 0) return '';
  let resto = numero;
  let resultado = '';
  for (const [valor, simbolo] of VALORES) {
    while (resto >= valor) {
      resultado += simbolo;
      resto -= valor;
    }
  }
  return resultado;
}
