let lineCount = 1, lineDisplay, editor, scrollPos, currentHoverMenu = null, prevScrollTop = 0, currentFile = null, currentLine = 0, lang;

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

let KEYWORDS, parseIndex, parseLine, isMultiLineComment = false;

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
        if (parseLine[parseIndex] == ' ' || parseLine[parseIndex] == '\t') 
            value += parseLine[parseIndex];
        else 
            return `<span class='symbol'>${value.replaceAll("    ", "\t")}</span>`;
    }

    return `<span class='symbol'>${value.replaceAll("    ", "\t")}</span>`;
}

function parseNumber(parseLine) {
    let isDecimal = false, value = "" + parseLine[parseIndex], idxLimit = 18 + parseIndex++;
    for (; parseIndex < parseLine.length; ++parseIndex) {
        if (parseIndex >= idxLimit || (isDecimal && parseLine[parseIndex] == '.')) {
            return null;
        } else if (isNumeric(parseLine[parseIndex])) {
            value += parseLine[parseIndex];
        } else if (parseLine[parseIndex] == '.') {
            value += '.';
            isDecimal = true;
        } else {
            return `<span class='number'>${value}</span>`;
        }
    }

    return `<span class='number'>${value}</span>`;
}

function parseString(parseLine) {
    let value = "", strStart = parseLine[parseIndex];
    ++parseIndex; //We know that the previous parseIndex is the character '"'
    for (; parseIndex < parseLine.length; ++parseIndex) {
        if (parseLine[parseIndex] == strStart) {
            ++parseIndex; //Getting past the final ' or "
            return `<span class='string'>"${value}"</span>`;
        } else {
            value += parseLine[parseIndex];
        }
    }
    
    return `<span class='string'>${value}</span>`;
}

function parseKeyword(parseLine) {
    let value = "" + parseLine[parseIndex++];
    for (; parseIndex < parseLine.length; ++parseIndex) {
        if (!isAlphaNumeric(parseLine[parseIndex])) {
            for (let i = 0; i < KEYWORDS.length; ++i) {
                if (KEYWORDS[i] == value) 
                    return `<span class='keyword'>${value}</span>`;
            }

            return `<span class='identifier'>${value}</span>`;
        }
        
        value += parseLine[parseIndex];
    }

    for (let i = 0; i < KEYWORDS.length; ++i) {
        if (KEYWORDS[i] == value) 
            return `<span class='keyword'>${value}</span>`;
    }

    return `<span class='identifier'>${value}</span>`;
}

function parseOperator(parseLine) {
    let value = "" + parseLine[parseIndex++];
    for (; parseIndex < parseLine.length; ++parseIndex) {
        if (isOperator(value + parseLine[parseIndex]))
            value += parseLine[parseIndex];
        else if (value == '<')
            return `<span class='symbol'>&lt;</span>`;
        else if (value == '>')
            return `<span class='symbol'>&gt;</span>`;
        else
            return `<span class='symbol'>${value}</span>`;
    }

    return `<span class='symbol'>${value == '<' ? '&lt;' : value == '>' ? '&gt;' : value}</span>`;
}

function highlightLine(parseLine) {
    parseIndex = 0;
    let line = "", temp, enoughChars, curr;
    while (parseIndex < parseLine.length) {
        enoughChars = parseIndex < parseLine.length - 1;
        curr = parseLine[parseIndex];
        if (enoughChars && curr == '/' && parseLine[parseIndex + 1] == '/') { //Single Comment
            return line + `<span class='comment'>${parseLine.substring(parseIndex)}</span>`;  
        } else if (enoughChars && curr == '/' && parseLine[parseIndex + 1] == '*') { //MultiComment
            isMultiLineComment = true;
            return line + `<span class='comment'>${parseLine.substring(parseIndex)}</span>`;  
        } else if (enoughChars && curr == '*' && parseLine[parseIndex + 1] == '/' && isMultiLineComment) { 
            isMultiLineComment = false;
            return line + `<span class='comment'>${parseLine.substring(parseIndex)}</span>`;  
        } else if (curr == ';') {
            line += `<span class='symbol'>;</span>`;
            ++parseIndex;
        } else if (isNumeric(curr)) { //Parsing a number
            temp = parseNumber(parseLine);
            if (temp == null) 
                throw Error("Error while parsing number!");
            else 
                line += temp;
        } else if (curr == '"' || curr == "'" || lang == "JS" && curr == '`') { //Parsing a String value
            temp = parseString(parseLine);
            if (temp == null) 
                throw Error("Error while parsing String!");
            else 
                line += temp;
        } else if (curr == ' ' || curr == '\t') { //Parsing a space
            line += parseSpace(parseLine);
        } else if (isAlpha(curr) || curr == '_') { //Parsing a keyword or an identifier
            temp = parseKeyword(parseLine);
            if (temp == null) 
                throw Error("Error while parsing keyword/identifier!");
            else 
                line += temp;
        } else { //Parsing an operator
            temp = parseOperator(parseLine);
            if (temp == null) {
                throw Error("Unknown character found: " + curr);
            } else 
                line += temp;
        }
    }

    return line;
}

function insertHighlights(content) {
    let res = "", updated = "", idx;
    isMultiLineComment = false;

    if (lang == "TEXT") {
        for (let i = 0; i < content.length; ++i) {
            if (content[i] == '\n') {
                res += `<div class='code-line'><span class='symbol'>${updated}</span></div>`;
                updated = "";
            } else if (content[i] == '\\') 
                updated += "\\";
            else if (content[i] == '>') 
                updated += "&gt;";
            else if (content[i] == '<') 
                updated += "&lt;";
            else if (content[i] != '\r') 
                updated += content[i];
        }

        return res;
    } else {
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
                    editor.innerHTML = res;
                    res += "<div class='code-line'>" + highlightLine(updated) + "</div>";
                }

                updated = "";
            } else if (content[i] == '\\') {
                updated += "\\";
            } else if (content[i] != '\r') {
                updated += content[i];
            }
        }

        idx = updated.indexOf("*/");
        res += `<div class='code-line'>`;
        if (isMultiLineComment && idx == -1) //Multi-line comment hasn't finished yet
            return res + `<span class='comment'>${updated}</span></div>`;  
        else if (isMultiLineComment) 
            return res + `<span class='comment'>${updated.substring(0, idx + 2)}</span>${highlightLine(updated.substring(idx + 2))}</div>`; 
        else
            return res + highlightLine(updated) + "</div>";
    }

}
//#endregion


function sleep(milliseconds) {
    return new Promise(r => setTimeout(r, milliseconds));
}

/*function removeTabs(text, start, end) {
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
}*/

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

/*async function autoSave() {
    while (true) {
        await sleep(1000 * 60 * 2);
        if (currentFile != null) 
            saveFile();
    }
}*/

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
    lineDisplay.children.item(goingUp ? --currentLine : ++currentLine).style = "font-weight: 500; opacity: 80%";
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
            
            lineDisplay.children.item(currentLine).style = "font-weight: 500; opacity: 80%";
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
    lang = file.name.substring(file.name.indexOf('.') + 1).toUpperCase();
    switch (lang) {
        case "JAVA":
        case "CLASS":
        case "JAD":
        case "JAR":
        case "JSP": lang = "JAVA"; KEYWORDS = JAVA_KEYWORDS; break;
        case "CPP":
        case "CC":
        case "C++":
        case "CP":
        case "CXX": lang = "C++"; KEYWORDS = CPP_KEYWORDS; break;
        default: lang = "TEXT"; break;
    }
    
    lineDisplay.innerHTML = "";
    lineCount = 1;
    let content = await file.text();
    editor.innerHTML = insertHighlights(content);
    updateLD();
}

function updateLD() {
    if (editor.scrollWidth > editor.clientWidth) 
        editor.style.height = "calc(82vh + 10px)";
    else
        editor.style.height = "";
        
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
