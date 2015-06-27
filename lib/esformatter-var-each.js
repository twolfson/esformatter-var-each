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
  // If the token is not a variable declaration (e.g. `var`, `let`), exit early
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
  if (node.type !== 'VariableDeclaration') {
    return node;
  }

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

  // Find the head and tail of the var declaration for reuse among its declaration clones
  // e.g. `var hello = 'world', goodbye = 'moon';` -> ['var', ' '] = starting tokens; ['hello = world'] = declaration; ...; [';'] = endToken
  var startingTokens = [];
  rocamboleToken.eachInBetween(varDeclaration.startToken, declarators[0].startToken, function saveToken (token) {
    startingTokens.push(token);
  });
  var endingTokens = [];
  rocamboleToken.eachInBetween(declarators[declarators.length - 1].endToken.next, varDeclaration.endToken, function saveToken (token) {
    endingTokens.push(token);
  });

  // Generate a `var` for each of the declarators
  // e.g. `var hello = 'world', goodbye = 'moon';` -> `var hello = 'world'; var goodbye = 'moon';`
  var declarations = [];
  declarators.forEach(function generateDeclaration (declarator, index) {
    // Generate a new delcaration similar to the original
    // Example: `var hello = 'world', goodbye = 'moon';` should use `var` and have a trailing semicolon `;`
    var declaration = {
      type: varDeclaration.type, // should always be `VariableDeclaration`
      declarations: [declarator],
        // link to declaration's tokens
      kind: varDeclaration.kind // (e.g. `var`, `let`)
      // prev: connect to `declarations[i - 1]` or if first, original var's `prev`
      // next: connect to `declarations[i + 1]` or if last, original var's `next`
    };

    // Attach declarator's starts/ends to our declaration
    //   Handle node
    declarator.parent = declaration;
    // console.log('waaat', declarator.startToken.prev);

    // If this is the first declaration, replace the previous node/token of the original declaration
    // TODO: Is it possible for any of the parents to have the same start token? If so, replace them too
    if (index === 0) {
      // Replace nodes
      var varDeclarationPrevNode = varDeclaration.prev;
      if (varDeclarationPrevNode) {
        varDeclarationPrevNode.next = declaration;
        declaration.prev = varDeclarationPrevNode;
      // TODO: Handle parent's child case
      }

      // Replace tokens
      // https://github.com/millermedeiros/rocambole-token/blob/fc03674b38f288dc545db0a5b2bdfd2d96cab170/remove.js#L10-L23
      var varDeclarationPrevToken = varDeclaration.startToken.prev;
      if (varDeclarationPrevToken) {
        varDeclarationPrevToken.next = declaration.startToken;
        declaration.startToken.prev = varDeclarationPrevToken;
      } else if (varDeclaration.startToken.root) {
        var varDeclarationRootNode = varDeclaration.startToken.root;
        varDeclarationRootNode.startToken = declaration.startToken;
      }
    // Otherwise, connect this to the previous declaration
    } else {

    }

    // If this is the last declaration, replace the next node/token of the original declaration
    // DEV: There is no otherwise case as we take care of that when linking to "previous" declarations

    // Return the declaration
    declarations.push(declaration);
  });

  console.log('FINAL', node.parent.toString());

  // Return the updated node
  return node;
};

// Export our transformation
// https://github.com/millermedeiros/esformatter/tree/v0.4.3#transformbeforeast
exports.transform = function (ast) {
  rocambole.moonwalk(ast, exports._transformNode);
};
