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
          type: 'VariableDeclaration',
          declarations: [declarator],
          kind: varDeclaration.kind, // (e.g. `var`, `let`)
          startToken: {
            type: varDeclaration.startToken.type, // should always be `Keyword`
            value: varDeclaration.startToken.value, // (e.g. `var`, `let`)
            // prev: connect to previous `declarations[i - 1].endToken`
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
        declaration.startToken.prev = declarations[index - 1].endToken;
      }

      // If we are not the last item, connect to the next declaration's token
      if (index !== lenMinusOne) {
        // TODO: We might need whitespace... (e.g. `var hai;\nvar bai;`)
        declaration.endToken.next = declarations[index + 1].startToken;
      // Otherwise, connect to the original declaration's next token
      } else {
        declaration.endToken.next = varDeclarationEndToken;
      }
    });

    // TODO: Remove this (it is here to block the temp `forEach` from running
    return node;

    // For each of the declarators
    declarators.forEach(function splitDeclarators (declarator, index) {
      // If we are the last declarator, do nothing
      var nextDeclarator = declarator.next;
      if (nextDeclarator === undefined) {
        return;
      }

      // Make our declarator standalone
      delete declarator.next;

      // Match the same ending as the `var` (e.g. semicolon or line break)
      // TODO: Allow for forcing semicolon/line break?
      var oldEndToken = declarator.endToken;
      declarator.endToken.next = {
        // TODO: This might need to be `declarators[declarators.length - 1]`
        type: varDeclaration.endToken.type,
        value: varDeclaration.endToken.value,
        // next: connected later,
        prev: oldEndToken.prev
      };

      // Promote the next declarator under a shiny new `VariableDeclaration`
      // TODO: Figure out how to deal with ranges
      var nextVarDeclaration = {
        type: 'VariableDeclaration',
        declarations: [nextDeclarator],
        kind: varDeclaration, // (e.g. `var`, `let`)
        startToken: {
          type: 'Keyword',
          value: varDeclaration.startToken.value, // (e.g. `var`, `let`)
          // TODO: Handle `range`
        },
        // TODO: Connect to next declaration -_-;;
        endToken: {

        }
      };
      // nextVarDeclaration.startToken.prev = connected later;
      nextVarDeclaration.startToken.next = {
        type: 'WhiteSpace',
        value: ' ',
        prev: nextVarDeclaration.startToken,
        next: nextDeclarator.startToken
      };

      // Connect the current declarator to the new declaration
      declarator.endToken.next.next = nextVarDeclaration.startToken;
      nextVarDeclaration.startToken.prev = declarator.endToken.next.next;
    });
  }

  // Return the updated node
  return node;
};
