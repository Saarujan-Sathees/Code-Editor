let lineCount = 1, lineDisplay, editor, scrollPos, currentHoverMenu = null, prevScrollTop = 0, currentFile = null, currentLine = 0;

//#region Syntax
const CPP_KEYWORDS = [ "auto", "else", "long", "switch", "break", "virtual", "register", "typedef", "case", "extern", "return", "union",
                       "char", "float", "short", "unsigned", "const", "for", "signed", "void", "continue", "goto", "sizeof", "volatile",
                       "default", "if", "static", "while", "do", "int", "struct", "_Packed", "double", "bool", "try", "catch", "class",
                       "delete", "new", "else", "explicit", "true", "false", "null", "friend", "inline", "long", "namespace", "nullptr",
                       "private", "protected", "public", "requires", "template", "throw", "this", "typeid", "typename", "using", "enum" ];

const JAVA_KEYWORDS = [ "class", "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "const", "continue", "default",
                        "do", "double", "else", "enum", "extends", "final", "finally", "float", "for", "goto", "if", "implements", 
                        "import", "instanceof", "int", "interface", "long", "native", "new", "package", "private", "protected", "public",
                        "return", "short", "static", "strictfp", "super", "switch", "synchronized", "this", "throw", "throws", "transient",
                        "try", "void", "volatile", "while" ];

let parseIndex, parseLine, isMultiLineComment = false;

const OPERATORS = [ "+", "-", "*", "/", "%", "=", "+=", "-=", "*=", "/=", "%=", "++", "--",
                    "==", "!", "!=", ">", "<", ">=", "<=", "(", ")", "{", "}", "[", "]", ".", ",", "&&", "||" ];

function isAlpha(c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}

function isNumeric(c) {
    return c >= '0' && c <= '9';
}

function isOperator(s) {
    for (let i = 0; i < OPERATORS.length; ++i) {
        if (OPERATORS[i] == s) return true;
    }

    return false;
}

function isAlphaNumeric(c) {
    return isAlpha(c) || isNumeric(c) || c == '_';
}

function parseSpace(parseLine) {
    let value = "";
    for (; parseIndex < parseLine.length; ++parseIndex) {
        if (parseLine.charAt(parseIndex) == ' ' || parseLine[parseIndex] == '\t') 
            value += parseLine.charAt(parseIndex);
        else 
            return `<span class='symbol'>${value.replaceAll("    ", "\t")}</span>`;
    }

    return `<span class='symbol'>${value.replaceAll("    ", "\t")}</span>`;
}

function parseNumber(parseLine) {
    let isDecimal = false, value = "" + parseLine.charAt(parseIndex), idxLimit = 18 + parseIndex++;
    for (; parseIndex < parseLine.length; ++parseIndex) {
        if (parseIndex >= idxLimit || (isDecimal && parseLine.charAt(parseIndex) == '.')) {
            return null;
        } else if (isNumeric(parseLine.charAt(parseIndex))) {
            value += parseLine.charAt(parseIndex);
        } else if (parseLine.charAt(parseIndex) == '.') {
            value += '.';
            isDecimal = true;
        } else {
            return `<span class='number'>${value}</span>`;
        }
    }

    return `<span class='number'>${value}</span>`;
}

function parseString(parseLine) {
    let value = "", strStart = parseLine.charAt(parseIndex);
    ++parseIndex; //We know that the previous parseIndex is the character '"'
    for (; parseIndex < parseLine.length; ++parseIndex) {
        if (parseLine.charAt(parseIndex) == strStart) {
            ++parseIndex; //Getting past the final ' or "
            return `<span class='string'>"${value}"</span>`;
        } else if (parseLine.charAt(parseIndex) == '\\') {
            if (parseIndex == parseLine.length - 1) {
                return "";
            } else {
                switch (parseLine.charAt(++parseIndex)) {
                    case 'b': value += '\b'; break;
                    case 'f': value += '\f'; break;
                    case 'n': value += '\n'; break;
                    case 'r': value += '\r'; break;
                    case 't': value += '\t'; break;
                    case '\'': value += "'"; break;
                    case '"': value += '"'; break;
                    case '\\': value += '\\'; break;
                    default: return null;
                }
            }
        } else {
            value += parseLine.charAt(parseIndex);
        }
    }
    
    return `<span class='string'>${value}</span>`;
}

function parseKeyword(parseLine) {
    let value = "" + parseLine.charAt(parseIndex++);
    for (; parseIndex < parseLine.length; ++parseIndex) {
        if (!isAlphaNumeric(parseLine.charAt(parseIndex))) {
            for (let i = 0; i < JAVA_KEYWORDS.length; ++i) {
                if (JAVA_KEYWORDS[i] == value) 
                    return `<span class='keyword'>${value}</span>`;
            }

            return `<span class='identifier'>${value}</span>`;
        }
        
        value += parseLine.charAt(parseIndex);
    }

    return `<span class='identifier'>${value}</span>`;
}

function parseOperator(parseLine) {
    let value = "" + parseLine.charAt(parseIndex++);
    for (; parseIndex < parseLine.length; ++parseIndex) {
        if (isOperator(value + parseLine.charAt(parseIndex)))
            value += parseLine.charAt(parseIndex);
        else 
            return `<span class='symbol'>${value}</span>`;
    }

    return `<span class='symbol'>${value}</span>`;
}

function highlightLine(parseLine) {
    parseIndex = 0;
    let line = "", temp, enoughChars;
    while (parseIndex < parseLine.length) {
        enoughChars = parseIndex < parseLine.length - 1;
        if (enoughChars && parseLine[parseIndex] == '/' && parseLine[parseIndex + 1] == '/') { //Single Comment
            return line + `<span class='comment'>${parseLine.substring(parseIndex)}</span>`;  
        } else if (enoughChars && parseLine[parseIndex] == '/' && parseLine[parseIndex + 1] == '*') { //MultiComment
            isMultiLineComment = true;
            return line + `<span class='comment'>${parseLine.substring(parseIndex)}</span>`;  
        } else if (enoughChars && parseLine[parseIndex] == '*' && parseLine[parseIndex + 1] == '/' && isMultiLineComment) { 
            isMultiLineComment = false;
            return line + `<span class='comment'>${parseLine.substring(parseIndex)}</span>`;  
        } else if (parseLine.charAt(parseIndex) == ';') {
            return line + "<span class='symbol'>;</span>";
        } else if (isNumeric(parseLine.charAt(parseIndex))) { //Parsing a number
            temp = parseNumber(parseLine);
            if (temp == null) 
                throw Error("Error while parsing number!");
            else 
                line += temp;
        } else if (parseLine.charAt(parseIndex) == '"' || parseLine.charAt(parseIndex) == "'") { //Parsing a String value
            temp = parseString(parseLine);
            if (temp == null) 
                throw Error("Error while parsing String!");
            else 
                line += temp;
        } else if (parseLine.charAt(parseIndex) == ' ' || parseLine.charAt(parseIndex) == '\t') { //Parsing a space
            line += parseSpace(parseLine);
        } else if (isAlpha(parseLine.charAt(parseIndex)) || parseLine.charAt(parseIndex) == '_') { //Parsing a keyword or an identifier
            temp = parseKeyword(parseLine);
            if (temp == null) 
                throw Error("Error while parsing keyword/identifier!");
            else 
                line += temp;
        } else { //Parsing an operator
            temp = parseOperator(parseLine);
            if (temp == null) {
                alert('"' + parseLine[parseIndex] + '"');
                throw Error("Unknown character found!");
            } else 
                line += temp;
        }
    }

    return line;
}

function insertHighlights(content) {
    let res = "", updated = "", idx;
    for (let i = 0; i < content.length; ++i) {
        if (content[i] == '\n') {
            idx = updated.indexOf("*/");
            if (isMultiLineComment && idx == -1) { //Multi-line comment hasn't finished yet
                res += `<div class='code-line'><span class='comment'>${updated}</span></div>`;  
            } else if (isMultiLineComment) {
                isMultiLineComment = false;
                res += `<div class='code-line'><span class='comment'>${updated.substring(0, idx + 2)}</span>
                        ${highlightLine(updated.substring(idx + 2))}</div>`; 
            } else {
                res += "<div class='code-line'>" + highlightLine(updated) + "</div>";
            }

            updated = "";
        } else if (content[i] != '\r') {
            updated += content[i];
        }
    }

    return res;
}
//#endregion


function sleep(milliseconds) {
    return new Promise(r => setTimeout(r, milliseconds));
}

function removeTabs(text, start, end) {
    if (start >= end || text.length == 0) return; //If the selection is invalid, exits
    
    let selection = text.substring(start, end); //Getting selected text
    if (start == 0 && selection.charAt(0) == '\t') //If they selected from the start of the text and there is a tab to remove at start
        selection = selection.substring(1); //Removes the first tab, as there is no newline character before it

    return text.substring(0, start) + selection.replaceAll("\n\t", "\n") + text.substring(end); //Removing the remaining tabs
}

function addTabs(text, start, end) {
    if (start >= end || text.length == 0) return; //If the selection is invalid, exits

    let selection = text.substring(start, end); //Getting selected text
    if (start == 0) //If they selected from the start of the text
        selection = "\t" + selection; //Adding a tab to the start, as there is no newline character before it

    return text.substring(0, start) + selection.replaceAll("\n", "\n\t") + text.substring(end); //Adding the other tabs
}

function hoverListener(event) {
    if (event.target.className != "main-button") return;

    currentHoverMenu.style.display = "";
    currentHoverMenu.parentElement.style.backgroundColor = "";
    currentHoverMenu = event.target.children[0];
    currentHoverMenu.style.display = "block";
    event.target.style.backgroundColor = "var(--on-hover)";
}

function removeHoverState() {
    document.body.removeEventListener("click", removeHoverState, true);
    let mainButtons = document.getElementsByClassName("main-button");
    currentHoverMenu.style.display = "";
    currentHoverMenu.parentElement.style.backgroundColor = "";
    currentHoverMenu = null;
    
    for (let j = 0; j < mainButtons.length; ++j) {
        mainButtons.item(j).removeEventListener("mouseover", hoverListener);
    }
}

async function autoSave() {
    while (true) {
        await sleep(1000 * 60 * 2);
        if (currentFile != null) 
            saveFile();
    }
}

function getLineNode(selectedNode) {
    while (selectedNode.nodeName != "DIV") {
        selectedNode = selectedNode.parentNode;
    }

    return selectedNode;
}

function indexOfChild(element) {
    let index = 0;
    while ((element = element.previousSibling) != null) {
        ++index;
    }

    return index;
}

function setCaretPos(node, position) {
    let range = document.createRange(), selection = document.getSelection();
    range.setStart(node, position);
    range.collapse(true);

    selection.removeAllRanges();
    selection.addRange(range);
}

function setLineFocus(goingUp) {
    lineDisplay.children.item(currentLine).style = "";
    lineDisplay.children.item(goingUp ? --currentLine : ++currentLine).style = "font-weight: 500; opacity: 100%";
}

document.addEventListener("DOMContentLoaded", async () => {
    editor = document.getElementById("editor");
    lineDisplay = document.getElementById("line-display");
    lineDisplay.innerHTML = "<div class='line'>1</div>";
    let mainButtons = document.getElementsByClassName("main-button");

    for (let i = 0; i < mainButtons.length; ++i) {
        mainButtons.item(i).addEventListener('click', (e) => {
            if (e.target.className != 'main-button') return;
            e.target.children[0].style.display = "block";
            e.target.style.backgroundColor = "var(--on-hover)";
            currentHoverMenu = e.target.children[0];
            for (let j = 0; j < mainButtons.length; ++j) {
                mainButtons.item(j).addEventListener("mouseover", hoverListener);
            }

            document.body.addEventListener("click", removeHoverState, true);
        });
    }

    editor.addEventListener('beforeinput', () => {
        scrollPos = editor.scrollTop; //Stores the previous scroll position of editor to prevent scroll bug
    });

    editor.addEventListener("click", e => {
        let selection = document.getSelection();
        if (selection.anchorOffset == selection.focusOffset) { //If they only moved caret, without selecting a range of text
            lineDisplay.children.item(currentLine).style = "";
            currentLine = indexOfChild(getLineNode(selection.anchorNode));
            
            lineDisplay.children.item(currentLine).style = "font-weight: 500; opacity: 100%";
        }
    });

    editor.addEventListener('keydown', function(e) {
        let currentNode = editor.children.item(currentLine);
        if (e.key == "ArrowDown" && currentLine < lineCount - 1) {
            if (currentNode.nextElementSibling.textContent.length == 0) {
                e.preventDefault();
                setCaretPos(currentNode.nextSibling, 0);
            }

            setLineFocus(false);
        } else if (e.key == "ArrowUp" && currentLine > 0) {
            if (currentNode.previousElementSibling.textContent.length == 0) {
                alert("Hi");
                e.preventDefault();
                setCaretPos(currentNode.previousSibling, 0);
            }

            setLineFocus(true);
        } else if (e.key == "ArrowLeft") {
            if (document.getSelection().anchorNode.nodeName != "#text") {
                setLineFocus(true);
            } else {
                let node = document.getSelection().anchorNode, offset = document.getSelection().anchorOffset;
                if (node.parentElement.childNodes[0] == node && offset == 0) //If caret is before the start
                    setLineFocus(true);
            }
        } else if (e.key == "ArrowRight") {
            if (document.getSelection().anchorNode.nodeName != "#text") {
                setLineFocus(false);
            } else {
                let node = document.getSelection().anchorNode.parentNode, parent = node.parentElement, 
                    idx = parent.childElementCount - 1, pos = document.getSelection().anchorOffset;
                
                if (parent.childNodes[idx] == node && pos == parent.children[idx].textContent.length) { //If caret is after the end
                    setLineFocus(false);
                }
            }
        } else if (e.key == "Enter") {
            e.preventDefault();
            alert(document.getSelection().anchorOffset);
            let newline = document.createElement("div");
            newline.className = "code-line";
            editor.insertBefore(newline, currentNode.nextSibling);
            setCaretPos(newline, 0);
            newline = document.createElement("div");
            newline.className = "line";
            newline.textContent = ++lineCount;
            lineDisplay.appendChild(newline);
            setLineFocus(false);
        }
    });    

    while (true) {
        await sleep(300000);
        if (currentFile != null) 
            saveFile();
    }
});

async function saveFile(value = editor.value) {
    if (currentFile != null) {
        const writable = await currentFile.createWritable();
        await writable.write(value);
        await writable.close();
    }
}

async function openFile() {
    [currentFile] = await window.showOpenFilePicker();

    if (!currentFile || currentFile.kind != 'file') return;

    let file = await currentFile.getFile();
    document.title = "Editor - " + file.name;
    lineDisplay.innerHTML = "";
    lineCount = 1;
    let content = await file.text();
    editor.innerHTML = insertHighlights(content);
    updateLD();
}

function updateLD() {
    if (lineCount == editor.childElementCount) {
        return;
    } else if (lineCount < editor.childElementCount) {
        let line;
        for (lineCount; lineCount <= editor.childElementCount; ++lineCount) {
            line = document.createElement("div");
            line.className = "line";
            line.textContent = lineCount;
            lineDisplay.appendChild(line);
        }

        --lineCount;
    } else {
        for (lineCount = lineCount - 1; lineCount >= editor.childElementCount; --lineCount) {
            lineDisplay.removeChild(lineDisplay.childNodes.item(lineCount));
        }

        lineCount++;
    }
}

function scrollLD() {
    lineDisplay.scrollTop = editor.scrollTop;
}
