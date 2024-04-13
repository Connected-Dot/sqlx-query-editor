import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('extension.insertSQLQuery', () => generateQuery('insert')));
    context.subscriptions.push(vscode.commands.registerCommand('extension.selectSQLQuery', () => generateQuery('select')));
    context.subscriptions.push(vscode.commands.registerCommand('extension.updateSQLQuery', () => generateQuery('update')));
    context.subscriptions.push(vscode.commands.registerCommand('extension.deleteSQLQuery', () => generateQuery('delete')));
}

function generateQuery(type: 'insert' | 'select' | 'update' | 'delete') {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const document = editor.document;
    const text = document.getText();
    const structs = parseRustStructs(text);

    structs.forEach(struct => {
        if (struct.name.startsWith("New")) {
            const baseStructName = struct.name.substring(3); // Remove "New" prefix
            const baseStruct = structs.find(s => s.name === baseStructName);
            if (baseStruct) {
                const sqlQuery = generateSqlxQuery(struct, baseStruct, type);
                editor.edit(editBuilder => {
                    editBuilder.insert(editor.selection.start, sqlQuery + '\n');
                });
            }
        }
    });
}


function parseRustStructs(text: string): RustStruct[] {
    const structRegex = /pub struct (\w+)\s*\{([^}]+)\}/g;
    let match;
    const structs: RustStruct[] = [];

    while ((match = structRegex.exec(text)) !== null) {
        const structName = match[1];
        const fieldsBlock = match[2];
        const fields = parseFields(fieldsBlock);
        structs.push({
            name: structName,
            fields: fields
        });
    }

    return structs;
}

function parseFields(fieldsBlock: string): string[] {
    const fieldRegex = /pub\s+(\w+):\s+([\w\[\]<>]+),?/g;
    let match;
    const fields = [];
    while ((match = fieldRegex.exec(fieldsBlock)) !== null) {
        fields.push(match[1]); // Capture the field name
    }
    return fields;
}

// function generateSqlxQuery(newStruct: RustStruct, baseStruct: RustStruct): string {
//     const fieldNames = newStruct.fields.join(', ');
//     const placeholders = newStruct.fields.map((_, index) => `$${index + 1}`).join(', ');
//     const returningFields = baseStruct.fields.join(', ');

//     return `sqlx::query!(
//         r#"
// INSERT INTO ${camelToSnake(baseStruct.name)} (${fieldNames})
// VALUES (${placeholders})
// RETURNING ${returningFields}
//         "#,
//         ${newStruct.fields.map(field => 'self.' + field).join(', ')}
//     );`;
// }

function generateSqlxQuery(newStruct: RustStruct, baseStruct: RustStruct, queryType: 'insert' | 'select' | 'update' | 'delete'): string {
    const fieldNames = newStruct.fields.join(', ');
    const placeholders = newStruct.fields.map((_, index) => `$${index + 1}`).join(', ');

    switch (queryType) {
        case 'insert':
            return `sqlx::query!(
                "INSERT INTO ${camelToSnake(newStruct.name)} (${fieldNames})
                VALUES (${placeholders})
                RETURNING *;"
            );`;
        case 'select':
            return `sqlx::query_as!(
                ${baseStruct.name},
                "SELECT * FROM ${camelToSnake(baseStruct.name)}"
            );`;
        case 'update':
            const updateFields = newStruct.fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
            return `sqlx::query!(
                "UPDATE ${camelToSnake(baseStruct.name)}
                SET ${updateFields}
                WHERE id = $1
                RETURNING *;"
            );`;
        case 'delete':
            return `sqlx::query!(
                "DELETE FROM ${camelToSnake(baseStruct.name)}
                WHERE id = $1
                RETURNING *;"
            );`;
    }
}


function camelToSnake(name: string): string {
    return name.replace(/([A-Z])/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, "");
}

interface RustStruct {
    name: string;
    fields: string[];
}
