// Load in dependencies
var rocambole = require('rocambole');
var rocamboleToken = require('rocambole-token');

// Define a helper for creating a generic token
exports.createToken = exports.cloneToken = function (options) {
  return {
    type: options.type, // e.g. Keyword, Whitespace
    value: options.value, // e.g. 'var', ' '
    root: options.root || null, // e.g. Program node
    next: null,
    prev: null
  };
};

// Define helper for cloning a token chain
// DEV: The first and last nodes will lack a previous and next node respectively
exports.cloneTokenChain = function (tokens, options) {
  // For each of the tokens
  var newTokens = [];
  tokens.forEach(function copyToken (token, index) {
    // Clone our token
    var newToken = exports.cloneToken(token);

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
  // Determine whether we use automatic semicolon insertion or not
  var endingSemicolonToken = rocamboleToken.findNext(varDeclaration.endToken.prev, function findStatementTerminator (token) {
    return rocamboleToken.isSemiColon(token) || rocamboleToken.isBr(token);
  });
  if (rocamboleToken.isBr(endingSemicolonToken)) {
    endingSemicolonToken = null;
  }

  // Additionally, find the whitespace tokens before our `var` started (e.g. all indents/whitespace)
  var preStartingTokens = [];
  var token = varDeclaration.startToken.prev;
  while (token) {
    // If the token is whitespace or an indent, save it
    // https://github.com/millermedeiros/rocambole-token/blob/fc03674b38f288dc545db0a5b2bdfd2d96cab170/is.js#L19-L25
    if (token.type === 'WhiteSpace' || token.type === 'Indent') {
      preStartingTokens.unshift(token);
      token = token.prev;
    // Otherwise, stop
    // DEV: We ignore line breaks because this could be the start of a program
    //   Also, line breaks can lead to weird edge cases so we keep it consistent/predictable with a single one
    } else {
      break;
    }
  }

  // Copy over the preStartingTokens as betweenDeclarationTokens and add in `;` (if applicable) and `\n`
  // DEV: We add from the left of the queue so `\n` then `;` to get `[';', '\n', ' ']`
  var betweenDeclarationTokens = preStartingTokens.slice();
  var lineBreakToken = exports.createToken({
    type: 'LineBreak',
    value: options.lineBreak.value,
    root: varDeclaration.startToken.root
  });

  // Generate a `var` for each of the declarators
  // e.g. `var hello = 'world', goodbye = 'moon';` -> `var hello = 'world'; var goodbye = 'moon';`
  var declarations = declarators.map(function generateDeclaration (declarator, index) {
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
    return declaration;
  });

  // Set up linkages for nodes
  // DEV: None of these changes will affect the token chain
  //   However, each `node.toString()` is more/less impractical as there are no tokens bound to declarations
  declarations.forEach(function connectNodes (declaration, index) {
    // Attach declaration as the declarator's parent node
    var declarator = declaration.declarations[0];
    declarator.parent = declaration;

    // If this is the first node, connect to var declaration's previous node
    if (index === 0) {
      var varDeclarationPrevNode = varDeclaration.prev;
      if (varDeclarationPrevNode) {
        declaration.prev = varDeclarationPrevNode;
        varDeclarationPrevNode.next = declaration;
      }
    // Otherwise, connect to the last declaration
    } else {
      var lastDeclarationNode = declarations[index - 1];
      declaration.prev = lastDeclarationNode;
      lastDeclarationNode.next = declaration;
    }

    // If this is the last node, connect it to var declaration's next node
    if (index === declarations.length - 1) {
      var varDeclarationNextNode = varDeclaration.next;
      if (varDeclarationNextNode) {
        declaration.next = varDeclarationNextNode;
        varDeclarationNextNode.prev = declaration;
      }
    // Otherwise, do nothing as we will connect to the next node via the previous if/else
    } else {
      // Do nothing
    }

    // In all cases, save this var declaration's parent node as this declaration node's parent
    declaration.parent = varDeclaration.parent;
  });

  // Swap the declarations in the `body` of the parent block statement
  // e.g. `BlockStatement.body = [{orig VariableDeclaration}, some other expressions]`
  //     -> `BlockStatement.body = [{new VariableDeclaration}, {another new VariableDeclaration}, some other expressions]`
  var varDeclarationParentNode = varDeclaration.parent;
  var varDeclarationParentBodyIndex = varDeclarationParentNode.body.indexOf(varDeclaration);
  var spliceArgs = [varDeclarationParentBodyIndex, 1].concat(declarations);
  varDeclarationParentNode.body.splice.apply(varDeclarationParentNode.body, spliceArgs);

  // Handle token bindings (aka the annoying/hard part)
  // Insert endings for
  declarations.forEach(function defineAndAttachTokens (declaration, index) {
    // DEV: We have a few linkages to perform:
    //   Example: HEAD; var a = 1, b = 2; TAIL
    //     VariableDeclaration tokens = ['var', ' ', 'a', ' ', '=', ..., ';']
    //     VariableDeclarator tokens = ['a', ' ', '=', ..., '1']
    var declarator = declaration.declarations[0];

    // Define STARTING tokens for each VariableDeclaration (e.g. `var ` for `var a = 1`)
    // If this is the first VariableDeclaration
    if (index === 0) {
      // DEV: `varDeclaration.startToken` is already linked with all previous tokens in the application, making this transition easy
      // DEV: `varDeclaration.startToken` will be the `var` of `var ` (i.e. `['var', ' ']`, it's the `'var'`)
      var firstStartingToken = varDeclaration.startToken;
      var lastStartingToken = null;

      // Save ORIGINAL VariableDeclaration token (which links to HEAD) AS FIRST VariableDeclaration token (e.g. reuse the existing `var ` token chain)
      declaration.startToken = firstStartingToken;
    // Otherwise, (we are a non-first VariableDeclaration)
    } else {
      // Insert leading content for each non-first VariableDeclaration between VariableDeclaration's
      // Create `var ` tokens
      var newStartingTokens = exports.cloneTokenChain(startingTokens);
      // DEV: This is always defined as we always need a `var` keyword
      var firstStartingToken = newStartingTokens[0];
      var lastStartingToken = newStartingTokens[newStartingTokens.length - 1];

      // Attach FIRST `var ` token AS current VariableDeclaration START token
      declaration.startToken = firstStartingToken;

      // Attach LAST `var ` token TO FIRST VariableDeclarator token AS PREVIOUS token
      declarator.startToken.prev = lastStartingToken;
      lastStartingToken.next = declarator.startToken;
    }

    // Current state:
    // VariableDeclaration's: ['var a = 1', 'var b = 2'] // no ending tokens nor attachment (e.g. newlines nor next)
    //   When we are working on `var a = 1`, the `var ` of `var b = 2` is not yet defined
    //   so don't look at nextDeclaration for tokens except for what we need to inject

    // Define ENDING tokens for each VariableDeclaration (e.g. `;\n  ` for `var a = 1;\n  `)
    // If this is a non-last VariableDeclaration
    if (index < declarations.length - 1) {
      // Connect to the existing declarator chain
      // e.g. Reuse `, ` from `var a, b;` as our next token
      // DEV: `declarator.endToken.next` must exist because this is the non-final token
      var firstBetweenToken = declarator.endToken.next;
      var nextDeclarator = varDeclaration.declarations[index + 1];
      var lastBetweenToken = nextDeclarator.startToken.prev;

      // If there is no newline between this declaration and the next declaration
      //   then replace the comma with our newline
      // e.g. `var a, b` -> `var a\n b`
      // e.g. `var a /* hi */, b` -> `var a /* hi */\n b`
      // e.g. `var a, /* hi */ b` -> `var a\n /* hi */ b`
      var betweenNewlineToken = rocamboleToken.findInBetween(firstBetweenToken, lastBetweenToken.next, rocamboleToken.isBr);
      if (!betweenNewlineToken) {
        // Perform our comma replacement
        var betweenCommaToken = rocamboleToken.findInBetween(firstBetweenToken, lastBetweenToken.next, rocamboleToken.isComma);
        var newNewlineToken = exports.cloneToken(betweenNewlineToken);
        newNewlineToken.next = betweenCommaToken.next;
        newNewlineToken.prev = betweenCommaToken.prev;
        newNewlineToken.next.prev = newNewlineToken;
        newNewlineToken.prev.next = newNewlineToken;

        // If the comma was the first token, then overwrite it
        if (betweenCommaToken === firstBetweenToken) {
          firstBetweenToken = newNewlineToken;
        }
        // If the comma was the last token, then overwrite it
        if (betweenCommaToken === lastBetweenToken) {
          lastBetweenToken = newNewlineToken;
        }
      }

      // If we have a semicolon to inject (e.g. `var a, b;` ends with a `;`)
      if (endingSemicolonToken) {
        // Insert it before the next token
        // DEV: There is no case when there's no new line since we performed the replacement earlier
        // e.g. LineBreak -- `var a,\nb;` -> `var a;\nb;`
        // e.g. WhiteSpace + Comment -- `var a, // Hello\nb;` -> `var a; // Hello\nb;`
        // Copy and insert our semicolon
        var newSemicolonToken = exports.cloneToken(endingSemicolonToken);
        firstBetweenToken.next = newSemicolonToken;
        newSemicolonToken.prev = firstBetweenToken;

        // Swap places with the first firstBetweenToken
        firstBetweenToken = newSemicolonToken;
      }

      // Detach the last between token from it's original VariableDeclarator
      //   e.g. remind ourselves to connect declaration to declaration
      //   e.g. `var a = 1, b = 2;` -> ['var a = 1;\n ', 'b = 2']
      lastBetweenToken.next = null;

      // Save the declaration's ending token
      declaration.endToken = lastBetweenToken;
    // Otherwise, (this is the last VariableDeclaration)
    } else {
      // DEV: `lastDeclarator.endToken.next` is already linked with all previous tokens in the application, making this transition easy
      // DEV: `lastDeclarator.endToken.next` will be the `;` of `;\n  ` (i.e. `[';', '\n', '  ']`, it's the `';'`)
      var lastDeclarator = declarator;
      var firstEndingToken = lastDeclarator.endToken.next;
      var lastEndingToken = null;

      // If there is no first ending token, then we are at the end of the program (e.g. `var a = 1EOF`)
      if (!firstEndingToken) {
        // Save the same `lastDeclarator.endToken` as our `declaration.endToken` for consistency
        // DEV: `lastDeclarator.endToken` is already bound to `Program.endToken` as this was the original setup
        declaration.endToken = lastDeclarator.endToken;
      // Save ORIGINAL VariableDeclaration token (which links to TAIL) AS START token for  VariableDeclaration END token (e.g. reuse the existing `var ` token chain)
      } else {
        declaration.endToken = firstEndingToken;
      }
    }
  });
    // // Attach last VariableDeclaration END token to current VariableDeclaration START token
    // var lastDeclaration = declarations[index - 1];
    // lastDeclaration.endToken.next = firstStartingToken;
    // firstStartingToken.prev = lastDeclaration.endToken;

    // // QUEUE: nextDeclaration.startToken.prev = lastBetweenToken;
    // // QUEUE: lastBetweenToken.next = nextDeclaration.startToken;

  // Return the updated node
  return node;
};

// Export our transformation
// https://github.com/millermedeiros/esformatter/tree/v0.4.3#transformbeforeast
exports.transform = function (ast) {
  rocambole.moonwalk(ast, exports._transformNode);
};
