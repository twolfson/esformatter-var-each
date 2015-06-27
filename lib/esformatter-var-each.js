// Load in dependencies
var rocambole = require('rocambole');
var rocamboleToken = require('rocambole-token');

// Define helper for cloning a token chain
// DEV: The first and last nodes will lack a previous and next node respectively
exports.cloneTokenChain = function (tokens, options) {
  // For each of the tokens
  var newTokens = [];
  tokens.forEach(function copyToken (token, index) {
    // Clone our token
    var newToken = {
      type: token.type, // e.g. Keyword, Whitespace
      value: token.value, // e.g. 'var', ' '
      root: options.root || null, // e.g. Program node
      next: null,
      prev: null
    };

    // If there is a previous token, attach to it
    if (index > 0) {
      var lastToken = newTokens[index - 1];
      lastToken.next = newToken;
      newToken.prev = lastToken;
    }

    // Save our tokens
    newTokens.push(newToken);
  });

  // Return our new tokens
  return newTokens;
};

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
  rocamboleToken.eachInBetween(varDeclaration.startToken, declarators[0].startToken.prev, function saveToken (token) {
    startingTokens.push(token);
  });
  var endingTokens = [];
  rocamboleToken.eachInBetween(declarators[declarators.length - 1].endToken.next, varDeclaration.endToken, function saveToken (token) {
    endingTokens.push(token);
  });

  // Additionally, find the whitespace tokens before our `var` started (e.g. all indents/new lines)
  var earlierNonEmptyToken = rocamboleToken.findPrevNonEmpty(varDeclaration.startToken);
  var preStartingTokens = [];
  if (earlierNonEmptyToken) {
    rocamboleToken.eachInBetween(earlierNonEmptyToken.next, varDeclaration.startToken.prev, function saveToken (token) {
      preStartingTokens.push(token);
    });
  }

  // Generate a `var` for each of the declarators
  // e.g. `var hello = 'world', goodbye = 'moon';` -> `var hello = 'world'; var goodbye = 'moon';`
  var declarations = [];
  declarators.forEach(function generateDeclaration (declarator, index) {
    // DEV: A brief refresher on nodes and tokens
    //   Nodes are the AST representation of parts of a program (e.g. Identifier, VariableDeclaration)
    //   Tokens are the actual chunks of code these represent (e.g. Keyword, WhiteSpace)
    //   Tokens can be present without there being a node related to them
    //   Nodes have a prev (previous node on the same level), next (next node on the same level),
    //     parent (node containing our node), and sometimes something like a `body` key where they declare child nodes
    //     `body` varies from node type to node type
    //   Tokens don't have levels but are one giant chain
    //   Tokens have next (next token to render), prev (previous token to render),
    //     root (root node of the entire token chain -- i.e. a Program node)
    //   Nodes also have startToken and endToken which are the tokens that a node will start/end on
    //     (e.g. `var` is the start token for a VariableDeclaration)
    //   The only attachment from tokens to nodes is via `range` but this is brittle in rocambole so avoid it

    // Generate a new declaration similar to the original
    // Example: `var hello = 'world', goodbye = 'moon';` should use `var` and have a trailing semicolon `;`
    // https://github.com/millermedeiros/rocambole/blob/a3d0d63d58b769d13bad288aca32c6e2f7766542/rocambole.js#L69-L74
    var declaration = {
      type: varDeclaration.type, // should always be `VariableDeclaration`
      declarations: [declarator],
      kind: varDeclaration.kind, // (e.g. `var`, `let`)
      toString: varDeclaration.toString
      // prev: bound later
      // next: bound later
      // startToken: bound later
      // endToken: bound later
    };


    // Copy the token chains for our varDeclaration onto the current declaration
    var newStartingTokens = exports.cloneTokenChain(startingTokens, {
      root: varDeclaration.startToken.root /* Always Program node*/
    });
    var newEndingTokens = exports.cloneTokenChain(endingTokens, {
      root: varDeclaration.endToken.root /* Always Program node*/
    });

    // Attach the first token to our declaration
    declaration.startToken = newStartingTokens[0];
    declaration.endToken = newEndingTokens[newEndingTokens.length - 1];

    // Attach declarator's starts/ends to our declaration
    //   Handle node
    declarator.parent = declaration;
    //   Handle tokens
    declarator.startToken.prev = newStartingTokens[newStartingTokens.length - 1];
    newStartingTokens[newStartingTokens.length - 1].next = declarator.startToken;
    declarator.endToken.next = newEndingTokens[0];
    newEndingTokens[0].prev = declarator.endToken;

    // If this is the first declaration, replace the previous node/token of the original declaration
    if (index === 0) {
      // Replace nodes
      var varDeclarationPrevNode = varDeclaration.prev;
      if (varDeclarationPrevNode) {
        varDeclarationPrevNode.next = declaration;
        declaration.prev = varDeclarationPrevNode;
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
      // Attach nodes
      var lastDeclaration = declarations[index - 1];
      lastDeclaration.next = declaration;
      declaration.prev = lastDeclaration;

      // Attach tokens
      // TODO: If there's padding between sections (e.g. new line and indent), then add that here
      var linkingStartToken = declaration.startToken;
      var linkingEndToken = declaration.startToken;
      if (preStartingTokens.length) {
        var newPreStartingTokens = exports.cloneTokenChain(preStartingTokens, {
          root: varDeclaration.startToken.prev.root /* Always Program node*/
        });
        linkingStartToken = newPreStartingTokens[0];
        linkingEndToken = newPreStartingTokens[newPreStartingTokens.length - 1];
        linkingEndToken.next = declaration.startToken;
        declaration.startToken.prev = linkingEndToken;
      }
      lastDeclaration.endToken.next = linkingStartToken;
      linkingEndToken.prev = lastDeclaration.endToken;
    }

    // If this is the last declaration, replace the next node/token of the original declaration
    // DEV: There is no otherwise case as we take care of that when linking to "previous" declarations
    if (index === declarators.length - 1) {
      // Replace nodes
      var varDeclarationNextNode = varDeclaration.next;
      if (varDeclarationNextNode) {
        varDeclarationNextNode.prev = declaration;
        declaration.next = varDeclarationNextNode;
      }

      // Replace tokens
      // https://github.com/millermedeiros/rocambole-token/blob/fc03674b38f288dc545db0a5b2bdfd2d96cab170/remove.js#L10-L23
      var varDeclarationNextToken = varDeclaration.endToken.next;
      if (varDeclarationNextToken) {
        varDeclarationNextToken.prev = declaration.endToken;
        declaration.endToken.next = varDeclarationNextToken;
      } else if (varDeclaration.endToken.root) {
        var varDeclarationRootNode = varDeclaration.endToken.root;
        varDeclarationRootNode.endToken = declaration.endToken;
      }
    }

    // Return the declaration
    declarations.push(declaration);
  });

  // Swap the declarations in the `body` of the parent block statement
  // e.g. `BlockStatement.body = [{orig VariableDeclaration}, some other expressions]`
  //     -> `BlockStatement.body = [{new VariableDeclaration}, {another new VariableDeclaration}, some other expressions]`
  var varDeclarationParentNode = varDeclaration.parent;
  var varDeclarationParentBodyIndex = varDeclarationParentNode.body.indexOf(varDeclaration);
  varDeclarationParentNode.body.splice(varDeclarationParentBodyIndex, 1, declarations);

  console.log('FINAL', node.parent.toString());

  // Return the updated node
  return node;
};

// Export our transformation
// https://github.com/millermedeiros/esformatter/tree/v0.4.3#transformbeforeast
exports.transform = function (ast) {
  rocambole.moonwalk(ast, exports._transformNode);
};
