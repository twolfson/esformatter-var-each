// Load in dependencies
var rocambole = require('rocambole');
var rocamboleToken = require('rocambole-token');

// Handle setting of options
var options;
exports.setOptions = function (_options) {
  options = _options;
};

// Define our transform function
exports._transformNode = function (node) {
  // If the token is a variable declaration (e.g. `var`, `let`)
  // https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API
  // interface VariableDeclaration <: Declaration {
  //     type: "VariableDeclaration";
  //     declarations: [ VariableDeclarator ];
  //     kind: "var" | "let" | "const";
  // }
  // interface VariableDeclarator <: Node {
  //   type: "VariableDeclarator";
  //   id: Pattern;
  //   init: Expression | null;
  // }
  if (node.type === 'VariableDeclaration') {
    // If we are inside of a loop, do nothing (e.g. `for`, `while`, `do ... while`)
    // DEV: Technically, a while/dowhile can't have a `var` but this is for good measure
    var parentType = node.parent ? node.parent.type : '';
    if (parentType.match(/WhileStatement|DoWhileStatement|ForStatement|ForInStatement/)) {
      return node;
    }

    // Determine the terminating character
    // Example: `var foo = bar;`
    //   varDeclaration = {type: VariableDeclaration, declarations: [...], kind: 'var'}
    //   declarators[*] = {type: VariableDeclarator, id: {type: Identifier, name: 'foo'}, init: {type: Literal, value: 'bar'}}
    var varDeclaration = node;
    var declarators = varDeclaration.declarations;
    // TODO: I dislike this notion... can we scrap it?
    var lineEndingToken = varDeclaration.endToken;

    // If the terminating token is the same as the last declarator's, override it as a line break
    // DEV: This fixes `advanced-semicolon-less.js` which has no trailing line, making the last token be 'world'
    if (lineEndingToken === declarators[declarators.length - 1].endToken) {
      lineEndingToken = {
        type: 'LineBreak',
        value: options.lineBreak.value
      };
    }

    // Generate a `var` for each of the declarators
    // e.g. `var hello = 'world', goodbye = 'moon';` -> `var hello = 'world'; var goodbye = 'moon';`
    var declarations = declarators.map(function generateDeclaration (declarator, index) {
      // Generate a new delcaration similar to the original
      // Example: `var hello = 'world', goodbye = 'moon';` should use `var` and have a trailing semicolon `;`
      var declaration = {
        type: varDeclaration.type, // should always be `VariableDeclaration`
        declarations: [declarator],
          // link to declaration's tokens
        kind: varDeclaration.kind, // (e.g. `var`, `let`)
        // prev: connect to `declarations[i - 1]` or if first, original var's `prev`
        // next: connect to `declarations[i + 1]` or if last, original var's `next`

        // These tokens will be connected via rocambole-token
        startToken: {
          type: varDeclaration.startToken.type, // should always be `Keyword`
          value: varDeclaration.startToken.value // (e.g. `var`, `let`)
        },
        endToken: {
          type: lineEndingToken.type, // (e.g. `Punctuation`, `LineBreak`)
          value: lineEndingToken.value // (e.g. `;`, '\n')
        }
      };

      // Connect our tokens
      rocamboleToken.before(declarator.startToken, declaration.startToken);
      rocamboleToken.after(declarator.endToken, declaration.endToken);

      // Return the declaration
      return declaration;
    });

    // For each of our new declarations, connect them
    //   (e.g. `var hello = 'world';` should know `var goodbye = 'moon';` is next)
    declarations.forEach(function connectDeclarations (declaration, index) {
      // If this is the last item, do nothing
      if (index === declarations.length - 1) {
        return;
      }

      // Get the next declaration
      var nextDeclaration = declarations[index];

      // Connect them
      rocamboleToken.after(declaration.endToken, nextDeclaration.startToken);
    });

    // Connect our first declaration to the start/end of the original `var`
    // rocamboleToken.after(varDeclaration.startToken, declarations[0].startToken);
    // rocamboleToken.before(varDeclaration.endToken, declarations[declarations.length - 1].endToken);

    // Remove the start/end of the original var
    // rocamboleToken.remove(varDeclaration.startToken);
    // rocamboleToken.remove(varDeclaration.endToken);
  }

  // Return the updated node
  return node;
};

// Export our transformation
// https://github.com/millermedeiros/esformatter/tree/v0.4.3#transformbeforeast
exports.transform = function (ast) {
  rocambole.moonwalk(ast, exports._transformNode);
};
