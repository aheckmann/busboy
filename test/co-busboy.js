/* global describe,it,before,after */

var co = require('co')
var assert = require('assert')
var path = require('path')
var fs = require('fs')
var formstream = require('formstream')
var request = require('./request')

var busboy = require('../')

describe('co-busboy', function () {
  it('should work without autofields', function () {
    return co(function * () {
      var parts = busboy(request())
      var part
      var fields = 0
      var streams = 0
      while ((part = yield parts)) {
        if (part.length) {
          assert.strictEqual(part.length, 4)
          fields++
        } else {
          streams++
          part.resume()
        }
      }
      assert.strictEqual(fields, 6)
      assert.strictEqual(streams, 3)
    })
  })

  it('should work with autofields', function () {
    return co(function * () {
      var parts = busboy(request(), {
        autoFields: true
      })
      var part
      var fields = 0
      var streams = 0
      while ((part = yield parts)) {
        if (part.length) {
          fields++
        } else {
          streams++
          part.resume()
        }
      }
      assert.strictEqual(fields, 0)
      assert.strictEqual(streams, 3)
      assert.strictEqual(parts.fields.length, 6)
      assert.strictEqual(Object.keys(parts.field).length, 3)
    })
  })

  it('should work with autofields and arrays', function () {
    return co(function * () {
      var parts = busboy(request(), {
        autoFields: true
      })
      var part
      while ((part = yield parts)) {
        part.resume()
      }
      assert.strictEqual(Object.keys(parts.field).length, 3)
      assert.strictEqual(parts.field['file_name_0'].length, 3)
      assert.deepStrictEqual(parts.field['file_name_0'], [ 'super alpha file', 'super beta file', 'super gamma file' ])
    })
  })

  it('should work with delays', function () {
    return co(function * () {
      var parts = busboy(request(), {
        autoFields: true
      })
      var part
      var streams = 0
      while ((part = yield parts)) {
        streams++
        part.resume()
        yield wait(10)
      }
      assert.strictEqual(streams, 3)
    })
  })

  it('should not overwrite prototypes', function () {
    return co(function * () {
      var parts = busboy(request(), {
        autoFields: true
      })
      var part
      while ((part = yield parts)) {
        if (!part.length) part.resume()
      }
      assert.strictEqual(parts.field.hasOwnProperty, Object.prototype.hasOwnProperty)
    })
  })

  it('should throw error when the files limit is reached', function () {
    return co(function * () {
      var parts = busboy(request(), {
        limits: {
          files: 1
        }
      })
      var part
      var error
      try {
        while ((part = yield parts)) {
          if (!part.length) part.resume()
        }
      } catch (e) {
        error = e
      }

      assert.strictEqual(error.status, 413)
      assert.strictEqual(error.code, 'Request_files_limit')
      assert.strictEqual(error.message, 'Reach files limit')
    })
  })

  it('should throw error when the fields limit is reached', function () {
    return co(function * () {
      var parts = busboy(request(), {
        limits: {
          fields: 1
        }
      })
      var part
      var error
      try {
        while ((part = yield parts)) {
          if (!part.length) part.resume()
        }
      } catch (e) {
        error = e
      }

      assert.strictEqual(error.status, 413)
      assert.strictEqual(error.code, 'Request_fields_limit')
      assert.strictEqual(error.message, 'Reach fields limit')
    })
  })

  it('should throw error when the parts limit is reached', function () {
    return co(function * () {
      var parts = busboy(request(), {
        limits: {
          parts: 1
        }
      })
      var part
      var error
      try {
        while ((part = yield parts)) {
          if (!part.length) part.resume()
        }
      } catch (e) {
        error = e
      }

      assert.strictEqual(error.status, 413)
      assert.strictEqual(error.code, 'Request_parts_limit')
      assert.strictEqual(error.message, 'Reach parts limit')
    })
  })

  it('should use options.checkField do csrf check', function () {
    return co(function * () {
      var parts = busboy(request(), {
        checkField: function (name, value) {
          if (name === '_csrf' && value !== 'pass') {
            return new Error('invalid csrf token')
          }
        }
      })
      var part
      try {
        while ((part = yield parts)) {
          if (part.length) {
            assert.strictEqual(part.length, 4)
          } else {
            part.resume()
          }
        }
        throw new Error('should not run this')
      } catch (err) {
        assert.strictEqual(err.message, 'invalid csrf token')
      }
    })
  })

  it('should use options.checkFile do filename extension check', function () {
    return co(function * () {
      var parts = busboy(request(), {
        checkFile: function (fieldname, filestream, filename) {
          if (path.extname(filename) !== '.dat') {
            return new Error('invalid filename extension')
          }
        }
      })
      var part
      try {
        while ((part = yield parts)) {
          if (part.length) {
            assert.strictEqual(part.length, 4)
          } else {
            part.resume()
          }
        }
        throw new Error('should not run this')
      } catch (err) {
        assert.strictEqual(err.message, 'invalid filename extension')
      }
    })
  })

  describe('checkFile()', function () {
    var logfile = path.join(__dirname, 'test.log')
    before(function () {
      fs.writeFileSync(logfile, Buffer.alloc(1024 * 1024 * 10))
    })

    after(function () {
      fs.unlinkSync(logfile)
    })

    it('should checkFile fail', function () {
      const form = formstream()

      form.field('foo1', 'fengmk2').field('love', 'chair1')
      form.file('file', logfile)
      form.field('foo2', 'fengmk2').field('love', 'chair2')
      form.headers = form.headers()
      form.headers['content-type'] = form.headers['Content-Type']

      return co(function * () {
        var parts = busboy(form, {
          checkFile: function (fieldname, fileStream, filename) {
            var extname = filename && path.extname(filename)
            if (!extname || ['.jpg', '.png'].indexOf(extname.toLowerCase()) === -1) {
              var err = new Error('Invalid filename extension: ' + extname)
              err.status = 400
              return err
            }
          }
        })

        var part
        var fileCount = 0
        var fieldCount = 0
        var err
        while (true) {
          try {
            part = yield parts
            if (!part) {
              break
            }
          } catch (e) {
            err = e
            break
          }

          if (!part.length) {
            fileCount++
            part.resume()
          } else {
            fieldCount++
          }
        }

        assert.strictEqual(fileCount, 0)
        assert.strictEqual(fieldCount, 4)
        assert(err)
        assert.strictEqual(err.message, 'Invalid filename extension: .log')
      })
    })

    it('should checkFile pass', function () {
      const form = formstream()

      form.field('foo1', 'fengmk2').field('love', 'chair1')
      form.file('file', logfile)
      form.field('foo2', 'fengmk2').field('love', 'chair2')
      form.headers = form.headers()
      form.headers['content-type'] = form.headers['Content-Type']

      return co(function * () {
        var parts = busboy(form, {
          checkFile: function (fieldname, fileStream, filename) {
            var extname = filename && path.extname(filename)
            if (!extname || ['.jpg', '.png', '.log'].indexOf(extname.toLowerCase()) === -1) {
              var err = new Error('Invalid filename extension: ' + extname)
              err.status = 400
              return err
            }
          }
        })

        var part
        var fileCount = 0
        var fieldCount = 0
        var err
        while (true) {
          try {
            part = yield parts
            if (!part) {
              break
            }
          } catch (e) {
            err = e
            break
          }

          if (!part.length) {
            fileCount++
            part.resume()
          } else {
            fieldCount++
          }
        }

        assert.strictEqual(fileCount, 1)
        assert.strictEqual(fieldCount, 4)
        assert(!err)
      })
    })
  })
})

function wait (ms) {
  return function (done) {
    setTimeout(done, ms)
  }
}
