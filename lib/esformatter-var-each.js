// Load in dependencies
var tokenUtils = require('rocambole-token');

// DEV: We use `tokenBefore` to update tokens (e.g. break down
//   vars) before they are fully parsed (e.g. `VariableDeclaration`)
// https://github.com/millermedeiros/esformatter/tree/v0.4.3#tokenbeforetoken

// Keyword : var
// WhiteSpace :
// Identifier : a
// WhiteSpace :
// Punctuator : =
// WhiteSpace :
// String : 'hello'
// LineBreak :

// WhiteSpace :
// Punctuator : ,
// WhiteSpace :
// Identifier : b
// WhiteSpace :
// Punctuator : =
// WhiteSpace :
// String : 'world'
// Punctuator : ;
// LineBreak :

exports.nodeBefore = function (node) {
  // If the token is a variable declaration (e.g. `var`, `let`)
  // https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API
  // interface VariableDeclaration <: Declaration {
  //     type: "VariableDeclaration";
  //     declarations: [ VariableDeclarator ];
  //     kind: "var" | "let" | "const";
  // }
  if (node.type === 'VariableDeclaration') {
    // TODO: If we are inside of a loop, do nothing
    // For each of the declarations
    var declarations = node.declarations;
    console.log(declarations);
    // console.log(tokenUtils.findNext('Punctuator'));
  }
};
