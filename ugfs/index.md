---
layout: article
title: Unit Gradient Fields
titles:
  en      : &EN       UGFs
  en-GB   : *EN
  en-US   : *EN
  en-CA   : *EN
  en-AU   : *EN
key: ugfs-home
article_header:
  align: center;
---

<style>
h3 {
    text-align: center;
}
</style>

Unit gradient fields (UGFs), like signed distance fields SDFs, have gradients with unit magnitude.  Although they do not necessarily represent the Euclidean distance to a shape, they are closed under offsets and booleans, unlike SDFs.  This project explores the relationships between SDFs, and UGFs, and other fields.

I'm currently collecting my notes in a document that appears to be turning into a book.  It's at a very early stage where it could use feedback.  I look forward to your thoughts.

### [Preview Manuscript&nbsp;&nbsp;&nbsp; <br>![UGF Manuscript Thumbnail](assets/Cover Thumbnail.svg){: width="30%" height="30%" align=center}]( {{site.data.ugf.latest}} ){: onclick="gtag('event', 'download_ugf');"}


## Overview:
Some of the main objects and operations relate as follows:

![Shapes and Fields Diagram](assets/Shapes and Fields Legend.svg){: width="39%" height="39%"}
&nbsp;&nbsp;&nbsp;
![Shapes and Fields Diagram](assets/Shapes and Fields Diagram.svg){: width="57%" height="57%"}


