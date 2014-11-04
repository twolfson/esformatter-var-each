// Load in dependencies
var assert = require('assert');
var fs = require('fs');
var esformatter = require('esformatter');
var esformatterVarEach = require('../');

// Register our plugin
esformatter.register(esformatterVarEach);

// Define test utilities
var testUtils = {
  format: function (filepath) {
    before(function formatFn () {
      // Format our content
      var input = fs.readFileSync(filepath, 'utf8');
      this.output = esformatter.format(input);
    });
    after(function cleanup () {
      // Cleanup output
      delete this.output;
    });
  }
};

// Basic variable tests
describe('esformatter-var-each', function () {
  describe('formatting a JS file with comma-last variables', function () {
    testUtils.format(__dirname + '/test-files/basic-comma-last.js');

    it('converts each variable to its own `var` statement', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/basic-comma-last.js', 'utf8');
      assert.strictEqual(this.output, expectedOutput);
    });
  });

  describe('formatting a JS file with comma-first variables', function () {
    testUtils.format(__dirname + '/test-files/basic-comma-first.js');

    it('converts each variable to its own `var` statement', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/basic-comma-first.js', 'utf8');
      assert.strictEqual(this.output, expectedOutput);
    });
  });

  describe('formatting a JS file with var-each variables', function () {
    testUtils.format(__dirname + '/test-files/basic-var-each.js');

    it('does nothing', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/basic-var-each.js', 'utf8');
      assert.strictEqual(this.output, expectedOutput);
    });
  });
});

// Intermediate tests
describe('esformatter-var-each', function () {
  describe('formatting a JS file with indented variables', function () {
    testUtils.format(__dirname + '/test-files/intermediate-indented-vars.js');

    it('converts each variable to its own `var` statement', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/intermediate-indented-vars.js', 'utf8');
      assert.strictEqual(this.output, expectedOutput);
    });
  });

  describe('formatting a JS file with hoisted variables', function () {
    testUtils.format(__dirname + '/test-files/intermediate-hoisted-vars.js');

    it('converts each variable to its own `var` statement', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/intermediate-hoisted-vars.js', 'utf8');
      assert.strictEqual(this.output, expectedOutput);
    });
  });
});

// Advanced tests
describe('esformatter-var-each', function () {
  describe.skip('formatting a multi-line variables', function () {
    testUtils.format(__dirname + '/test-files/advanced-multi-line.js');

    it('converts each variable to its own `var` statement', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/advanced-multi-line.js', 'utf8');
      assert.strictEqual(this.output, expectedOutput);
    });
  });
});
