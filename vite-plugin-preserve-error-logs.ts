import type { Plugin } from 'vite';
import { parse } from '@babel/parser';
import generate from '@babel/generator';
import type { Node } from '@babel/types';

// Import traverse with proper handling for both CommonJS and ES modules
// @babel/traverse exports differently in different environments
import _traverse from '@babel/traverse';
const traverse = (_traverse as any).default || _traverse;

/**
 * Plugin to selectively remove console methods while preserving console.error
 * Uses Babel AST transformation for safe, accurate code modification
 */
export function preserveErrorLogs(): Plugin {
  return {
    name: 'preserve-error-logs',
    enforce: 'post',
    apply: 'build',
    transform(code, id) {
      // Only process source files, skip node_modules and already transformed code
      if (!id.includes('src') || id.includes('node_modules') || !id.match(/\.(js|ts|jsx|tsx)$/)) {
        return null;
      }

      try {
        // Parse code into AST
        const ast = parse(code, {
          sourceType: 'module',
          plugins: [
            'typescript',
            'jsx',
            'decorators-legacy',
            'classProperties',
            'objectRestSpread',
            'asyncGenerators',
            'functionBind',
            'exportDefaultFrom',
            'exportNamespaceFrom',
            'dynamicImport',
            'nullishCoalescingOperator',
            'optionalChaining',
          ],
        });

        // Track if we made any changes
        let hasChanges = false;

        // Traverse AST and remove console calls (except console.error)
        const traverseFn = (traverse as unknown as { default?: typeof traverse }).default || traverse;
        traverseFn(ast, {
          CallExpression(path) {
            const { node } = path;
            
            // Check if this is a console method call
            if (
              node.callee.type === 'MemberExpression' &&
              node.callee.object.type === 'Identifier' &&
              node.callee.object.name === 'console' &&
              node.callee.property.type === 'Identifier'
            ) {
              const methodName = node.callee.property.name;
              
              // Remove console.log, console.warn, console.info, console.debug, console.trace
              // But preserve console.error
              if (['log', 'warn', 'info', 'debug', 'trace'].includes(methodName)) {
                // Replace with empty expression statement
                path.replaceWith({
                  type: 'ExpressionStatement',
                  expression: {
                    type: 'UnaryExpression',
                    operator: 'void',
                    prefix: true,
                    argument: {
                      type: 'NumericLiteral',
                      value: 0,
                    },
                  },
                } as any);
                hasChanges = true;
              }
            }
          },
        });

        // If we made changes, generate new code
        if (hasChanges) {
          const generateFn = (generate as unknown as { default?: typeof generate }).default || generate;
          const output = generateFn(ast, {
            retainLines: false,
            compact: false,
          }, code);
          
          return {
            code: output.code,
            map: output.map,
          };
        }

        return null;
      } catch (error) {
        // If parsing fails, return original code
        // This can happen with files that have syntax we don't support
        console.warn(`[preserve-error-logs] Failed to transform ${id}:`, error);
        return null;
      }
    },
  };
}

