module.exports = function (grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        copy: {
            main: {
                files: [
                    {expand: true, cwd: '<%= pkg.sourcePath %>/', src: ['**'], dest: '<%= pkg.buildPath %>/'},
                    {src: '<%= pkg.sourcePath %>/images/Icon-64.png', dest: '<%= pkg.buildPath %>/Icon-64.png'}
                ]
            }
        },
        "string-replace": {
            keys: {
                files: {
                    "<%= pkg.buildPath %>/scripts/core.js": "<%= pkg.buildPath %>/scripts/core.js"
                },
                options: {
                    replacements: [
                        {
                            pattern: 'clientSecret: ""',
                            replacement: 'clientSecret: "' + grunt.option("clientSecret") + '"'
                        },
                        {
                            pattern: 'clientId: ""',
                            replacement: 'clientId: "' + grunt.option("clientId") + '"'
                        }
                    ]
                }
            },
            sandboxApi: {
                files: {
                    "<%= pkg.buildPath %>/scripts/feedly.api.js": "<%= pkg.buildPath %>/scripts/feedly.api.js"
                },
                options: {
                    replacements: [
                        {
                            pattern: /http(?:s)?:\/\/(?:www\.)?cloud\.feedly\.com/gi,
                            replacement: "http://sandbox.feedly.com"
                        }
                    ]
                }
            },
            sandboxLink: {
                files: {
                    "<%= pkg.buildPath %>/popup.html": "<%= pkg.buildPath %>/popup.html"
                },
                options: {
                    replacements: [
                        {
                            pattern: /http(?:s)?:\/\/(?:www\.)?feedly\.com/gi,
                            replacement: "http://sandbox.feedly.com"
                        }
                    ]
                }
            }
        },
        uglify: {
            dist: {
                files: {
                    "<%= pkg.buildPath %>/scripts/core.js": ["<%= pkg.buildPath %>/scripts/core.js"],
                    "<%= pkg.buildPath %>/scripts/feedly.api.js": ["<%= pkg.buildPath %>/scripts/feedly.api.js"],
                    "<%= pkg.buildPath %>/scripts/options.js": ["<%= pkg.buildPath %>/scripts/options.js"],
                    "<%= pkg.buildPath %>/scripts/popup.js": ["<%= pkg.buildPath %>/scripts/popup.js"]
                }
            }
        }
    });

    grunt.loadNpmTasks("grunt-contrib-copy");
    grunt.loadNpmTasks('grunt-string-replace');
    grunt.loadNpmTasks("grunt-contrib-uglify");

    grunt.registerTask("build", ["copy", "string-replace:keys", "uglify"]);
    grunt.registerTask("sandbox", ["copy", "string-replace"]);
    grunt.registerTask("default", ["copy", "string-replace:keys"]);
};