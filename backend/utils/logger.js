const formatContext = (context) => (context ? `[${context}]` : '');

export const logger = {
  info(message, context) {
    console.log(`${new Date().toISOString()} INFO ${formatContext(context)} ${message}`);
  },
  warn(message, context) {
    console.warn(`${new Date().toISOString()} WARN ${formatContext(context)} ${message}`);
  },
  error(message, context, error) {
    console.error(
      `${new Date().toISOString()} ERROR ${formatContext(context)} ${message}`,
      error ? { stack: error.stack || String(error) } : ''
    );
  },
};
