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
    var varDeclaration = node;
    var declarators = varDeclaration.declarations;
    console.log(varDeclaration.startToken);
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
