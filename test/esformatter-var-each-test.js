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

// Start our tests
describe('esformatter-var-each', function () {
  describe('formatting a JS file with comma-last variables', function () {
    testUtils.format(__dirname + '/test-files/comma-last.js');

    it('converts each variable to its own `var` statement', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/comma-last.js', 'utf8');
      assert.strictEqual(this.output, expectedOutput);
    });
  });

  describe('formatting a JS file with comma-first variables', function () {
    testUtils.format(__dirname + '/test-files/comma-first.js');

    it('converts each variable to its own `var` statement', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/comma-first.js', 'utf8');
      assert.strictEqual(this.output, expectedOutput);
    });
  });

  describe('formatting a JS file with indented variables', function () {
    testUtils.format(__dirname + '/test-files/indented-vars.js');

    it('converts each variable to its own `var` statement', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/indented-vars.js', 'utf8');
      assert.strictEqual(this.output, expectedOutput);
    });
  });

  describe('formatting a JS file with hoisted variables', function () {
    testUtils.format(__dirname + '/test-files/hoisted-vars.js');

    it('converts each variable to its own `var` statement', function () {
      var expectedOutput = fs.readFileSync(__dirname + '/expected-files/hoisted-vars.js', 'utf8');
      assert.strictEqual(this.output, expectedOutput);
    });
  });
});
