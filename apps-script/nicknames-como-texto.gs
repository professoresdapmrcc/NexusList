/**
 * Integração opcional no Apps Script que implementa organizeData.
 * Chame no lugar do setValues do bloco de dados, passando os cabeçalhos reais.
 * Este arquivo precisa ser instalado no servidor; o HTML não o executa.
 */
function gravarLinhasNexusListComoTexto(aba, linhaInicial, dados, cabecalhos) {
  if (!aba || !Array.isArray(cabecalhos) || !Array.isArray(dados) ||
      !Number.isInteger(linhaInicial) || linhaInicial < 2) {
    throw new Error('Parâmetros inválidos para gravar a NexusList.');
  }
  var colunaNick = cabecalhos.findIndex(function (valor) {
    return String(valor || '').trim().toUpperCase() === 'NICKNAME';
  });
  if (colunaNick < 0) throw new Error('Cabeçalho NICKNAME não encontrado.');
  // Validar tudo antes de modificar a planilha. Não adivinhar pontos perdidos.
  var linhas = dados.map(function (linha) {
    if (!Array.isArray(linha) || linha.length !== cabecalhos.length ||
        typeof linha[colunaNick] !== 'string' || !linha[colunaNick].trim()) {
      throw new Error('NICKNAME deve chegar como texto. Confira os dados antes de gravar.');
    }
    var copia = linha.slice();
    copia[colunaNick] = linha[colunaNick].trim();
    return copia;
  });
  if (!linhas.length) return;
  // Formatação ANTES da gravação para impedir interpretação numérica.
  aba.getRange(linhaInicial, colunaNick + 1, linhas.length, 1).setNumberFormat('@');
  aba.getRange(linhaInicial, 1, linhas.length, cabecalhos.length).setValues(linhas);
}
