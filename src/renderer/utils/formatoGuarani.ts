// El formato de guaranies vive en shared/ porque el proceso main tambien lo
// necesita para el ticket. Este archivo queda como punto de entrada para los
// componentes que ya lo importaban.
export { formatearGs, formatearGsConPrefijo, parsearGs } from '../../shared/formato/guarani';
