import log from 'electron-log';

log.transports.file.level = 'info';
log.transports.file.maxSize = 5_242_880;
log.transports.console.level = 'debug';

export { log };
