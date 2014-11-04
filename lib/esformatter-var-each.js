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
      // If this is the first declaration, use the original declaration
      if (index === 0) {
        return varDeclaration;
      // Otherwise, generate a new delcaration similar to the original
      } else {
        // Generate our new node
        // Example: `var`` ` ... `;` (i.e. `var` <-> ` ` <-> ... <-> `;`)
        var declaration = {
          type: varDeclaration.type, // should always be `VariableDeclaration`
          declarations: [declarator],
          kind: varDeclaration.kind, // (e.g. `var`, `let`)
          // prev: connect to `declarations[i - 1]`
          //   (ignore first element since that already is hooked up properly)
          // next: connect to `declarations[i + 1]` or if last, original var's `endToken`
          startToken: {
            type: varDeclaration.startToken.type, // should always be `Keyword`
            value: varDeclaration.startToken.value, // (e.g. `var`, `let`)
            // prev: connect to `declarations[i - 1].endToken`
            //   (ignore first element since that already is hooked up properly)
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
            // next: connect to `declarator[i + 1].startToken`?
          }
        };
        declaration.startToken.next.prev = declaration.startToken;

        // Return the declaration
        return declaration;
      }
    });

    // Connect all of our declarations
    // Example: `Leading code` <-> `var ... ;` <-> `var ... ;` <-> `Trailing code`
    var varDeclarationEndToken = varDeclaration.endToken;
    var lenMinusOne = declarations.length - 1;
    declarations.forEach(function connectDeclaration (declaration, index) {
      // If we are not the first item, connect to the previous declaration's token
      if (index !== 0) {
        declaration.prev = declarations[index - 1];
        declaration.startToken.prev = declarations[index - 1].endToken;
      }

      // If we are not the last item, connect to the next declaration's token
      if (index !== lenMinusOne) {
        // TODO: We might need whitespace... (e.g. `var hai;\nvar bai;`)
        declaration.next = declarations[index + 1];
        declaration.endToken.next = declarations[index + 1].startToken;
      // Otherwise, connect to the original declaration's next token
      } else {
        declaration.next = varDeclaration.next;
        declaration.endToken.next = varDeclarationEndToken;
      }
    });
  }

  // Return the updated node
  return node;
};
