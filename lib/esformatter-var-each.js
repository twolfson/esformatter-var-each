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

// TODO: How do we deal with `range`?

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
    // Generate a `var` for each of the declarators
    var varDeclaration = node;
    var declarators = varDeclaration.declarations;
    var declarations = declarators.map(function generateDeclaration (declarator, index) {
      // Generate a new delcaration similar to the original
      // Example: `var`` ` ... `;` (i.e. `var` <-> ` ` <-> ... <-> `;`)
      var declaration = {
        type: varDeclaration.type, // should always be `VariableDeclaration`
        declarations: [declarator],
        kind: varDeclaration.kind, // (e.g. `var`, `let`)
        // prev: connect to `declarations[i - 1]` or if first, original var's `prev`
        // next: connect to `declarations[i + 1]` or if last, original var's `next`
        startToken: {
          type: varDeclaration.startToken.type, // should always be `Keyword`
          value: varDeclaration.startToken.value, // (e.g. `var`, `let`)
          // prev: connect to `declarations[i - 1].endToken` or if first, original var's `startToken.prev`
          next: {
            type: varDeclaration.startToken.next.type, // should be `WhiteSpace`
            value: varDeclaration.startToken.next.value, // (e.g. ` `)
            // prev: set later to `declaration.startToken`
            next: declarator.startToken
          }
        },
        endToken: {
          type: varDeclaration.endToken.type, // (e.g. `Punctuation`, `LineBreak`)
          value: varDeclaration.endToken.value, // (e.g. `;`, '\n')
          prev: declarator.endToken
          // next: connect to `declarator[i + 1].startToken` or if last, original var's `endToken.next`
        }
      };
      declaration.startToken.next.prev = declaration.startToken;

      // Return the declaration
      return declaration;
    });

    // Connect all of our declarations
    // Example: `Leading code` <-> `var ... ;` <-> `var ... ;` <-> `Trailing code`
    var varDeclarationStartToken = varDeclaration.startToken;
    var varDeclarationEndToken = varDeclaration.endToken;
    var lenMinusOne = declarations.length - 1;
    declarations.forEach(function connectDeclaration (declaration, index) {
      // If we are the first item, connect to `varDeclaration's` predecessor
      if (index === 0) {
        declaration.prev = varDeclaration.prev;
        declaration.startToken.prev = varDeclarationStartToken.prev;
      // Otherwise, connect to the previous declaration
      } else {
        declaration.prev = declarations[index - 1];
        declaration.startToken.prev = declarations[index - 1].endToken;
      }

      // If we are the last item, connect to `varDeclaration's` successor
      if (index === lenMinusOne) {
      // Otherwise, connect to the next declaration
        declaration.next = varDeclaration.next;
        declaration.endToken.next = varDeclarationEndToken.next;
      } else {
        // TODO: We might need whitespace... (e.g. `var hai;\nvar bai;`)
        declaration.next = declarations[index + 1];
        declaration.endToken.next = declarations[index + 1].startToken;
      }
    });
  }

  // Return the updated node
  return node;
};
