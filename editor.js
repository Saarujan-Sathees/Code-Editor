let lineDisplay, editor, scrollPos, currentHoverMenu = null, prevScrollTop = 0, currentFile = null, lang;
let cursor = { lineCount: 1, currLine: 0, prevPos: 0 };


//#region Syntax
const CPP_KEYWORDS = [ "auto", "else", "long", "switch", "break", "virtual", "register", "typedef", "case", "extern", "return", "union",
                       "char", "float", "short", "unsigned", "const", "for", "signed", "void", "continue", "goto", "sizeof", "volatile",
                       "default", "if", "static", "while", "do", "int", "struct", "_Packed", "double", "bool", "try", "catch", "class",
                       "delete", "new", "else", "explicit", "true", "false", "null", "friend", "inline", "long", "namespace", "nullptr",
                       "private", "protected", "public", "requires", "template", "throw", "this", "typeid", "typename", "using", "enum",
                       "#include", "#pragma" ];

const JAVA_KEYWORDS = [ "class", "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "const", "continue", "default",
                        "do", "double", "else", "enum", "extends", "final", "finally", "float", "for", "goto", "if", "implements", 
                        "import", "instanceof", "int", "interface", "long", "native", "new", "package", "private", "protected", "public",
                        "return", "short", "static", "strictfp", "super", "switch", "synchronized", "this", "throw", "throws", "transient",
                        "try", "void", "volatile", "while" ];

let KEYWORDS, parseIndex, parseLine, isMultiLineComment = false;

const OPERATORS = [ "+", "-", "*", "/", "%", "=", "+=", "-=", "*=", "/=", "%=", "|=", "&=", "~=", "++", "--", ":", "?", "::", 
                    "|", "&", "~", "==", "!", "!=", ">", "<", ">=", "<=", "(", ")", "{", "}", "[", "]", ".", ",", "&&", "||" ];

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
    return isAlpha(c) || isNumeric(c) || c == '_' || c == '#' && lang == "C++";
}

const TAB_REPLACEMENT = "<span class='whitespace'>&nbsp</span><span class='whitespace'>&nbsp</span>" + 
                        "<span class='whitespace'>&nbsp</span><span class='whitespace'>&nbsp</span>";

function parseSpace(parseLine) {    
    let value = "";
    for (; parseIndex < parseLine.length; ++parseIndex) {
        if (parseLine[parseIndex] == ' ' || parseLine[parseIndex] == '\t') 
            value += "<span class='whitespace'>&nbsp</span>";
        else
            return value.replaceAll(TAB_REPLACEMENT, "<span class='whitespace'>&nbsp&nbsp&nbsp&nbsp</span>");
    }

    return value.replaceAll(TAB_REPLACEMENT, "<span class='whitespace'>&nbsp&nbsp&nbsp&nbsp</span>");
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

function parseInclude(parseLine) {
    let value = "&lt;";
    for (parseIndex = parseIndex + 1; parseIndex < parseLine.length; ++parseIndex) {
        if (parseLine[parseIndex] == '>') {
            ++parseIndex;
            return `<span class='string'>${value}&gt;</span>`;
        }
        
        value += parseLine[parseIndex];
    }

    return `<span class='string'>${value}&gt;</span>`;
}

function highlightLine(parseLine) {
    parseIndex = 0;
    let line = "", temp, enoughChars, curr, isIncludeStatement = false;
    while (parseIndex < parseLine.length) {
        enoughChars = parseIndex < parseLine.length - 1;
        curr = parseLine[parseIndex];
        if (enoughChars && curr == '/' && parseLine[parseIndex + 1] == '/') { //Single Comment
            return line + `<span class='comment'>${parseLine.substring(parseIndex)}</span>`;  
        } else if (enoughChars && curr == '/' && parseLine[parseIndex + 1] == '*') { //Multi Comment
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
        } else if (isAlpha(curr) || curr == '_' || curr == '#' && lang == 'C++') { //Parsing a keyword or an identifier
            temp = parseKeyword(parseLine);
            if (lang == "C++") 
                isIncludeStatement = temp.indexOf("#include") != -1;

            if (temp == null) 
                throw Error("Error while parsing keyword/identifier!");
            else 
                line += temp;
        } else { //Parsing an operator
            if (isIncludeStatement && curr == '<') {
                line += parseInclude(parseLine);
            } else {
                temp = parseOperator(parseLine);
                if (temp == null) {
                    throw Error("Unknown character found: " + curr);
                } else 
                    line += temp;
            }
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

function toggleDarkMode(button = document.getElementById()) {
    if (button.textContent == "Light Mode") {	                                                //Dark -> Light
		document.documentElement.style.setProperty('--background', "rgb(238 238 238)");
		document.documentElement.style.setProperty('--menu', "rgb(242 242 242)");
		document.documentElement.style.setProperty('--secondary-menu', "rgb(200 200 200)");
		document.documentElement.style.setProperty('--text', "rgb(60 60 60)");
		document.documentElement.style.setProperty('--on-hover', "rgb(220 220 220)");

        button.textContent = "Dark Mode";
		//root.style.setProperty('--shadow', "rgb(48 52 56)");
		//contextMenuStyle = "backdrop-filter: blur(8px) brightness(95%);";
		//btn.style.transform = "rotate(180deg)";
	} else {			                                                                        //Light -> Dark
        document.documentElement.style.setProperty('--background', "rgb(45 45 45)");
		document.documentElement.style.setProperty('--menu', "rgb(52 52 52)");
		document.documentElement.style.setProperty('--secondary-menu', "rgb(100 100 100)");
		document.documentElement.style.setProperty('--text', "rgb(210 210 210)");
		document.documentElement.style.setProperty('--on-hover', "rgb(70 70 70)");
        button.textContent = "Light Mode";
	}
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
    lineDisplay.children.item(cursor.currLine).style = "";
    lineDisplay.children.item(goingUp ? --cursor.currLine : ++cursor.currLine).style = "font-weight: 500; opacity: 80%";
}

function saveCursorPos(selection = document.getSelection()) {
    if (selection.focusNode.nodeName != "#text") return;

    let res = selection.focusOffset, currText = selection.focusNode.parentNode.previousSibling, 
        text = selection.focusNode.textContent.substring(0, res);

    while (currText != null) {
        res += currText.textContent.length;
        text = currText.textContent + text;
        currText = currText.previousSibling;
    }

    console.log(text);
    cursor.prevPos = res;
}

function useCursorPos(lineNode) {
    if (lineNode.textContent.length < cursor.prevPos) {
        let last = lineNode.childNodes[lineNode.childElementCount - 1];
        setCaretPos(last.childNodes[0], last.textContent.length);
    } else {
        let currNode = lineNode.childNodes[0], pos = cursor.prevPos;
        
        while (currNode != null) {
            if (currNode.textContent.length >= pos) {
                setCaretPos(currNode.childNodes[0], pos);
                return;
            } else {
                pos -= currNode.textContent.length;
            }

            currNode = currNode.nextSibling;
        }
    }
}

function createLine() {
    let res = document.createElement("div"), span = document.createElement("span");
    res.className = "code-line";
    res.appendChild(span);
    
    return res;
}

function onDragSelect(e) {
    let selection = document.getSelection();    
    saveCursorPos(selection);

    lineDisplay.children.item(cursor.currLine).style = "";
    cursor.currLine = indexOfChild(getLineNode(document.getSelection().focusNode));
    lineDisplay.children.item(cursor.currLine).style = "font-weight: 500; opacity: 80%";
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

    editor.addEventListener("click", onDragSelect);

    editor.addEventListener("mousedown", () => { editor.addEventListener("mousemove", onDragSelect); console.log("drag start") });

    editor.addEventListener("mouseup", e => { editor.removeEventListener("mousemove", onDragSelect); });

    editor.addEventListener('keydown', function(e) {
        let currentNode = editor.children.item(cursor.currLine);
        if (e.key == "ArrowDown" && cursor.currLine < cursor.lineCount - 1) {
            e.preventDefault();
            if (currentNode.nextElementSibling.textContent.length == 0) 
                setCaretPos(currentNode.nextSibling, 0);
            else //Trying to always store the previous cursor position 
                useCursorPos(getLineNode(currentNode.nextSibling));
    
            setLineFocus(false);
        } else if (e.key == "ArrowUp" && cursor.currLine > 0) {
            e.preventDefault();
            if (currentNode.previousElementSibling.textContent.length == 0) 
                setCaretPos(currentNode.previousSibling, 0);
            else //Trying to always store the previous cursor position 
                useCursorPos(getLineNode(currentNode.previousSibling));

            setLineFocus(true);
        } else if (e.key == "ArrowLeft") {
            let selection = document.getSelection(), node = selection.focusNode;

            //If cursor is in an empty line, or if the cursor is at the start of the line, moves back to the previous line
            if (node.nodeName != "#text" || node.parentNode.previousSibling == null && selection.focusOffset == 0) {
                if (cursor.currLine == 0) return; //Can't go past the start of the file

                setLineFocus(true); //Focusing on previous line, and saving cursor position
                cursor.prevPos = editor.children[cursor.currLine].textContent.length;
            } else {
                --cursor.prevPos; //Moving the saved cursor position back once
            }
        } else if (e.key == "ArrowRight") {
            let selection = document.getSelection(), endOfNode = selection.focusOffset == selection.focusNode.textContent.length;

            if (selection.anchorNode.nodeName != "#text" || selection.focusNode.parentNode.nextSibling == null && endOfNode) {
                if (cursor.currLine == cursor.lineCount - 1) return; //Can't go past the end of the file

                setLineFocus(false); //Focusing on next line
                cursor.prevPos = 0; //Saving cursor position
            } else {
                ++cursor.prevPos;
            }
        } else if (e.key == "Enter") {
            e.preventDefault();
            let node = document.getSelection().anchorNode, offset = document.getSelection().anchorOffset;
                    
            let newline = createLine();
            
            if (node.parentElement.childNodes[0] == node && offset == 0) { //If caret is at the start
                editor.insertBefore(newline, currentNode);
                setCaretPos(currentNode, 0);
            } else {
                editor.insertBefore(newline, currentNode.nextSibling);
                setCaretPos(newline, 0);
            }

            newline = document.createElement("div");
            newline.className = "line";
            newline.textContent = ++cursor.lineCount;
            lineDisplay.appendChild(newline);
            setLineFocus(false);
        } else if (e.key == "Backspace") {
            let selection = document.getSelection();
            if (selection.anchorOffset == selection.focusOffset) {
                let prev = selection.anchorNode.parentElement, beforePrev = prev.previousElementSibling;
                
                if (prev.className == "whitespace") {
                    e.preventDefault();
                    if (beforePrev != null)
                        setCaretPos(beforePrev.childNodes[0], beforePrev.childNodes[0].textContent.length);

                    prev.parentElement.removeChild(prev);
                }

            }
        }
    });    

    /*while (true) {
        await sleep(300000);
        if (currentFile != null) 
            saveFile();
    }*/
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
    cursor.lineCount = 1;
    let content = await file.text();
    editor.innerHTML = insertHighlights(content);
    updateLD();
}

function updateLD() {
    if (editor.scrollWidth > editor.clientWidth) 
        editor.style.height = "calc(82vh + 10px)";
    else
        editor.style.height = "";
        
    if (cursor.lineCount == editor.childElementCount) {
        return;
    } else if (cursor.lineCount < editor.childElementCount) {
        let line;
        for (cursor.lineCount; cursor.lineCount <= editor.childElementCount; ++cursor.lineCount) {
            line = document.createElement("div");
            line.className = "line";
            line.textContent = cursor.lineCount;
            lineDisplay.appendChild(line);
        }

        --cursor.lineCount;
    } else {
        for (cursor.lineCount = cursor.lineCount - 1; cursor.lineCount >= editor.childElementCount; --cursor.lineCount) {
            lineDisplay.removeChild(lineDisplay.childNodes.item(cursor.lineCount));
        }

        cursor.lineCount++;
    }
}

function scrollLD() {
    lineDisplay.scrollTop = editor.scrollTop;
}
