// DEV: We use `tokenBefore` to update tokens (e.g. break down
//   vars) before they are fully parsed (e.g. `VariableDeclaration`)
// https://github.com/millermedeiros/esformatter/tree/v0.4.3#tokenbeforetoken
exports.tokenBefore = function (token) {
  // If the token is a variable
  if (token.type === 'Keyword' && token.value === 'var') {
    console.log(token.type, ':', token.value);
  }
};
